import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const OBJECT_ANALYSIS_PROMPT_VERSION = "object-detect-v3";
export const DEFAULT_VISION_MODEL = "gpt-6-astra";

export const NARAKA_SOURCES = {
  YJp810: { filename: "YJp810-1080x1350.png", width: 1080, height: 1350 },
  YJp812: { filename: "YJp812-1200x627.png", width: 1200, height: 627 },
  YJp813: { filename: "YJp813-1200x627.png", width: 1200, height: 627 },
  YJp814: { filename: "YJp814-1920x1080.png", width: 1920, height: 1080 },
} as const;

export type NarakaSourceId = keyof typeof NARAKA_SOURCES;

export type DetectedCreativeObject = {
  z: number;
  name: string;
  kind: "image" | "text";
  machineLabel: string;
  finalLabel: string;
  decision: "pending";
  confidence: number;
  importance: "required" | "important" | "optional";
  resizeBehavior: "preserve" | "reposition" | "crop_allowed" | "background_extend";
  visibleText: string;
  bbox: { x: number; y: number; width: number; height: number };
};

export type CreativeAnalysisResult = {
  analysisId: string;
  sourceAsset: string;
  model: string;
  promptVersion: string;
  prompt: string;
  requestId: string | null;
  processingTimeMs: number;
  cached: boolean;
  objects: DetectedCreativeObject[];
  usage: unknown;
};

export const OBJECT_ANALYSIS_PROMPT = "Identify only visible, resize-relevant objects in this ad. Classify each as Hero, Background, Headline, Supporting copy, Supporting visual, Brand logo, App icon, Compliance, CTA, or Decorative. Use Supporting visual for gameplay screenshots, product images, framed screenshots, and secondary scene insets; never classify a non-text image as Supporting copy. Use App icon only for a dedicated square application icon, never for a brand wordmark or platform logo. Return tight normalized 0-1000 boxes, exact visible text, importance, confidence, and resize behavior. Never invent hidden PSD layers.";

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["objects"],
  properties: {
    objects: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "kind", "label", "confidence", "importance", "resizeBehavior", "visibleText", "bbox"],
        properties: {
          name: { type: "string", maxLength: 100 },
          kind: { type: "string", enum: ["image", "text"] },
          label: { type: "string", enum: ["Hero", "Background", "Headline", "Supporting copy", "Supporting visual", "Brand logo", "App icon", "Compliance", "CTA", "Decorative"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          importance: { type: "string", enum: ["required", "important", "optional"] },
          resizeBehavior: { type: "string", enum: ["preserve", "reposition", "crop_allowed", "background_extend"] },
          visibleText: { type: "string", maxLength: 200 },
          bbox: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "width", "height"],
            properties: {
              x: { type: "integer", minimum: 0, maximum: 1000 },
              y: { type: "integer", minimum: 0, maximum: 1000 },
              width: { type: "integer", minimum: 1, maximum: 1000 },
              height: { type: "integer", minimum: 1, maximum: 1000 },
            },
          },
        },
      },
    },
  },
} as const;

function configuredApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === "replace-me") throw new Error("OPENAI_API_KEY is missing or still a placeholder.");
  return key;
}

export function sourcePath(sourceAsset: NarakaSourceId): string {
  return path.join(process.cwd(), "public", "examples", "naraka", NARAKA_SOURCES[sourceAsset].filename);
}

export async function analyzeCreative(sourceAsset: NarakaSourceId): Promise<CreativeAnalysisResult> {
  const image = await fs.readFile(sourcePath(sourceAsset));
  return analyzeCreativeImage(sourceAsset, image);
}

export async function analyzeCreativeImage(sourceAsset: string, image: Buffer): Promise<CreativeAnalysisResult> {
  const started = Date.now();
  const model = process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;
  const cacheKey = createHash("sha256").update(image).update(model).update(OBJECT_ANALYSIS_PROMPT_VERSION).digest("hex");
  const cachePath = path.join(process.cwd(), "outputs", "naraka-mvp", `analysis-${cacheKey}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(cachePath, "utf8")) as CreativeAnalysisResult;
    return { ...cached, cached: true, processingTimeMs: Date.now() - started };
  } catch {
    // A cache miss is expected for a new source or prompt version.
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${configuredApiKey()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 3000,
      input: [{ role: "user", content: [
        { type: "input_text", text: OBJECT_ANALYSIS_PROMPT },
        { type: "input_image", image_url: `data:image/png;base64,${image.toString("base64")}`, detail: "high" },
      ] }],
      text: { format: { type: "json_schema", name: "creative_object_inventory", strict: true, schema: ANALYSIS_SCHEMA } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const requestId = response.headers.get("x-request-id");
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: unknown; error?: { code?: string; message?: string } };
  const outputText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((content) => content.type === "output_text")?.text;
  if (!response.ok || !outputText) throw new Error(payload.error?.message ?? `Vision analysis returned no structured output (HTTP ${response.status}).`);
  const parsed = JSON.parse(outputText) as { objects: Array<Omit<DetectedCreativeObject, "z" | "machineLabel" | "finalLabel" | "decision"> & { label: string }> };
  const objects = parsed.objects.map((object, index) => ({
    z: index,
    name: object.name,
    kind: object.kind,
    machineLabel: object.label,
    finalLabel: object.label,
    decision: "pending" as const,
    confidence: object.confidence,
    importance: object.importance,
    resizeBehavior: object.resizeBehavior,
    visibleText: object.visibleText,
    bbox: object.bbox,
  }));
  const result: CreativeAnalysisResult = { analysisId: randomUUID(), sourceAsset, model, promptVersion: OBJECT_ANALYSIS_PROMPT_VERSION, prompt: OBJECT_ANALYSIS_PROMPT, requestId, processingTimeMs: Date.now() - started, cached: false, objects, usage: payload.usage ?? null };
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
  return result;
}
