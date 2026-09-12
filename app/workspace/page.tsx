"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Tone = "slate" | "green" | "amber" | "violet";
// Rule text arrives with the candidate, resolved from recipe_rules. The page
// used to keep its own label dictionary, which had already drifted away from
// what the resolver emits.
type ResolvedRule = { slug: string; statement: string; why: string | null; layer: string };
type GenerationState = "idle" | "running" | "ready";
type CandidateDecision = "adopted" | "rejected";
type GenerationMode = "openai" | "deterministic_fallback" | "mixed" | "cache" | "pass_to_designer";
type AnalysisState = "idle" | "running" | "ready" | "error";
type DriveWorkspaceContext = {
  job: { id: string; clientName: string; industry: string | null; creativeFormat: string };
  asset: { id: string; filename: string; format: string | null; width: number | null; height: number | null; previewUrl: string };
  prompt: { recipeName: string; versionId: string; resolution: "industry" | "general_database" | "general_builtin" };
};

type SourceLayer = {
  z: number;
  name: string;
  kind: "image" | "text";
  machineLabel: string;
  finalLabel: string;
  decision: "pending" | "confirmed" | "corrected" | "ignored";
  confidence?: number;
  importance?: "required" | "important" | "optional";
  resizeBehavior?: "preserve" | "reposition" | "crop_allowed" | "background_extend";
  visibleText?: string;
  bbox?: { x: number; y: number; width: number; height: number };
};

type Target = {
  id: string;
  size: string;
  width: number;
  height: number;
  placement: string;
  state: "Covered" | "Gap" | "Pending spec";
  route: string;
  src: string;
  qa: string;
  tone: Tone;
};

// The default preview size, only used to pick one of the fetched targets.
const PREFERRED_FIRST_TARGET = "1940x500";
const SOURCE_PREVIEW_SRC = "/examples/naraka/YJp814-1920x1080.png";
const SOURCE_ASSET = "YJp814";
const DEFAULT_MODEL = "gpt-image-2.5-sunburst";
const DEFAULT_QUALITY = "low";
const DEFAULT_PROMPT_VERSION = "naraka-resolved-v13";

function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export default function WorkspacePreviewPage() {
  const [sourceLayers, setSourceLayers] = useState<SourceLayer[]>([]);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisModel, setAnalysisModel] = useState<string | null>(null);
  const [analysisPrompt, setAnalysisPrompt] = useState<string | null>(null);
  const [analysisTimeMs, setAnalysisTimeMs] = useState<number | null>(null);
  const [selectedLayerZ, setSelectedLayerZ] = useState(0);
  const [labelsConfirmed, setLabelsConfirmed] = useState(false);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [appliedSelection, setAppliedSelection] = useState<string[]>([]);
  const [selectedPreviewId, setSelectedPreviewId] = useState("");
  const [compareSource, setCompareSource] = useState(true);
  const [adjustmentMode, setAdjustmentMode] = useState(false);
  const [adjustment, setAdjustment] = useState({ x: 0, y: 0, scale: 100 });
  const [version, setVersion] = useState("original");
  const [generation, setGeneration] = useState<GenerationState>("idle");
  const [generationMode, setGenerationMode] = useState<GenerationMode | null>(null);
  const [generatedSources, setGeneratedSources] = useState<Record<string, string>>({});
  const [generatedStatuses, setGeneratedStatuses] = useState<Record<string, string>>({});
  const [generationRunIds, setGenerationRunIds] = useState<Record<string, string>>({});
  const [candidateModels, setCandidateModels] = useState<Record<string, string>>({});
  const [candidateQualities, setCandidateQualities] = useState<Record<string, string>>({});
  const [candidatePromptVersions, setCandidatePromptVersions] = useState<Record<string, string>>({});
  const [candidatePrompts, setCandidatePrompts] = useState<Record<string, string>>({});
  const [candidateResolvedRules, setCandidateResolvedRules] = useState<Record<string, ResolvedRule[]>>({});
  const [candidatePreflightWarnings, setCandidatePreflightWarnings] = useState<Record<string, string[]>>({});
  const [candidateTextRatios, setCandidateTextRatios] = useState<Record<string, number>>({});
  const [blockedTargets, setBlockedTargets] = useState<Record<string, { ruleCodes: string[]; reasons: string[] }>>({});
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [candidateDecisions, setCandidateDecisions] = useState<Record<string, CandidateDecision>>({});
  const [runComplete, setRunComplete] = useState(false);
  const [notice, setNotice] = useState("Interactive prototype · changes stay in this browser session");
  const [driveContext, setDriveContext] = useState<DriveWorkspaceContext | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [externalProcessingConsent, setExternalProcessingConsent] = useState(false);

  const selectedLayer = sourceLayers.find((layer) => layer.z === selectedLayerZ) ?? sourceLayers[0];
  const defaultTargetId = targets.find((target) => target.id === PREFERRED_FIRST_TARGET)?.id ?? targets[0]?.id;
  const appliedTargets = useMemo(() => targets.filter((target) => appliedSelection.includes(target.id)), [targets, appliedSelection]);
  const selectedPreview = appliedTargets.find((target) => target.id === selectedPreviewId) ?? appliedTargets[0];
  const sourceTarget: Target = driveContext ? {
    id: `source-${driveContext.asset.id}`,
    size: driveContext.asset.width && driveContext.asset.height ? `${driveContext.asset.width} × ${driveContext.asset.height}` : "Source preview",
    width: driveContext.asset.width ?? 1200,
    height: driveContext.asset.height ?? 800,
    placement: "Selected Drive source",
    state: "Covered",
    route: "drive_source",
    src: driveContext.asset.previewUrl,
    qa: "Source selected",
    tone: "green",
  } : {
    id: "source",
    size: "1920 × 1080",
    width: 1920,
    height: 1080,
    placement: "Original source",
    state: "Covered",
    route: "ready_to_use",
    src: SOURCE_PREVIEW_SRC,
    qa: "Source confirmed",
    tone: "green",
  };
  const sourceAssetLabel = driveContext?.asset.filename ?? SOURCE_ASSET;
  const displayTarget = selectedPreview && !compareSource ? selectedPreview : sourceTarget;
  const displayPreview = displayTarget ? { ...displayTarget, src: generatedSources[displayTarget.id] ?? displayTarget.src } : undefined;
  const reviewedCandidateCount = appliedTargets.filter((target) => candidateDecisions[target.id]).length;
  const allCandidatesReviewed = appliedTargets.length > 0 && reviewedCandidateCount === appliedTargets.length;
  const adoptedCount = appliedTargets.filter((target) => candidateDecisions[target.id] === "adopted").length;
  const adoptedTargets = appliedTargets.filter((target) => candidateDecisions[target.id] === "adopted");
  const activeTarget = targets.find((target) => target.id === draftSelection[0]);
  const selectedPrompt = selectedPreview ? candidatePrompts[selectedPreview.id] : undefined;
  const selectedModel = selectedPreview ? candidateModels[selectedPreview.id] : DEFAULT_MODEL;
  const selectedQuality = selectedPreview ? candidateQualities[selectedPreview.id] : DEFAULT_QUALITY;
  const selectedPromptVersion = selectedPreview ? candidatePromptVersions[selectedPreview.id] : driveContext?.prompt.versionId ?? DEFAULT_PROMPT_VERSION;
  const selectedResolvedRules = selectedPreview ? candidateResolvedRules[selectedPreview.id] ?? [] : [];
  const selectedTextRatio = selectedPreview ? candidateTextRatios[selectedPreview.id] : undefined;
  const progressStage = elapsedSeconds < 3 ? "Preparing confirmed layer snapshot" : elapsedSeconds < 20 ? "OpenAI is rearranging the artwork" : elapsedSeconds < 45 ? "Rendering the candidate" : "Still rendering this complex image edit";

  useEffect(() => {
    if (generation !== "running" || generationStartedAt === null) return;
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - generationStartedAt) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [generation, generationStartedAt]);

  // Target sizes are spec data, so they are fetched rather than declared here.
  useEffect(() => {
    fetch("/api/workspace/targets")
      .then(async (response) => {
        const payload = await response.json() as { targets?: Omit<Target, "src">[]; error?: string };
        if (!response.ok || !payload.targets) throw new Error(payload.error ?? "Target sizes could not be loaded.");
        setTargets(payload.targets.map((target) => ({ ...target, src: SOURCE_PREVIEW_SRC })));
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "Target sizes could not be loaded."));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("jobId");
    const assetId = params.get("assetId");
    if (!jobId || !assetId) return;
    fetch(`/api/workspace/context?${new URLSearchParams({ jobId, assetId })}`)
      .then(async (response) => {
        const payload = await response.json() as DriveWorkspaceContext & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Workspace context could not be loaded.");
        setDriveContext(payload);
        setTargets((current) => current.map((target) => ({ ...target, src: payload.asset.previewUrl })));
        setNotice(`${payload.asset.filename} loaded from Drive · ${payload.prompt.recipeName}`);
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "Workspace context could not be loaded."));
  }, []);
  const workflow = [
    { label: "Image received", state: "done" },
    { label: "Objects detected", state: analysisState === "ready" ? "done" : "active" },
    { label: "Confirm labels", state: analysisState !== "ready" ? "pending" : labelsConfirmed ? "done" : "active" },
    { label: "Select gaps", state: !labelsConfirmed ? "pending" : generation !== "running" ? "active" : "done" },
    { label: "Generate", state: generation === "running" ? "active" : appliedTargets.length > 0 ? "done" : "pending" },
    { label: "Customer decision", state: runComplete ? "done" : appliedTargets.length > 0 ? "active" : "pending" },
  ];

  function toggleTarget(id: string) {
    if (!labelsConfirmed || generation === "running") return;
    setDraftSelection((current) => current[0] === id ? [] : [id]);
  }

  function setSelectedLayerLabel(finalLabel: string) {
    setSourceLayers((current) => current.map((layer) => layer.z === selectedLayerZ ? { ...layer, finalLabel } : layer));
  }

  function reviewSelectedLayer(decision: SourceLayer["decision"]) {
    if (!selectedLayer) return;
    setSourceLayers((current) => current.map((layer) => {
      if (layer.z !== selectedLayerZ) return layer;
      if (decision === "confirmed") return { ...layer, finalLabel: layer.machineLabel, decision };
      if (decision === "ignored") return { ...layer, finalLabel: "Ignore", decision };
      return { ...layer, decision };
    }));
    setNotice(`Customer decision saved for “${selectedLayer.name}”`);
  }

  async function analyzeSource() {
    setAnalysisState("running");
    setNotice(`Analyzing ${sourceAssetLabel} with Vision LLM…`);
    try {
      const analysisRequest = driveContext
        ? { jobId: driveContext.job.id, assetId: driveContext.asset.id, externalProcessingConsent }
        : { sourceAsset: SOURCE_ASSET };
      const response = await fetch("/api/workspace/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(analysisRequest) });
      const result = await response.json() as { objects?: SourceLayer[]; model?: string; prompt?: string; processingTimeMs?: number; cached?: boolean; error?: string };
      if (!response.ok || !result.objects?.length || !result.model || !result.prompt) throw new Error(result.error ?? "Object analysis failed.");
      setSourceLayers(result.objects);
      setSelectedLayerZ(result.objects[0].z);
      setAnalysisModel(result.model);
      setAnalysisPrompt(result.prompt);
      setAnalysisTimeMs(result.processingTimeMs ?? null);
      setAnalysisState("ready");
      setNotice(`${result.objects.length} objects detected by ${result.model}${result.cached ? " · cache hit" : ""}`);
    } catch (error) {
      setAnalysisState("error");
      setNotice(error instanceof Error ? error.message : "Object analysis failed.");
    }
  }

  function confirmLayerLabels() {
    if (sourceLayers.length === 0) return;
    setSourceLayers((current) => current.map((layer) => ({
      ...layer,
      decision: layer.decision === "ignored" ? "ignored" : layer.finalLabel === layer.machineLabel ? "confirmed" : "corrected",
    })));
    setLabelsConfirmed(true);
    setDraftSelection(defaultTargetId ? [defaultTargetId] : []);
    setNotice(`${sourceLayers.length} object labels confirmed · gap sizes unlocked`);
  }

  function editLayerLabels() {
    setLabelsConfirmed(false);
    setGeneration("idle");
    setGenerationMode(null);
    setGeneratedSources({});
    setGeneratedStatuses({});
    setGenerationRunIds({});
    setCandidateModels({});
    setCandidateQualities({});
    setCandidatePromptVersions({});
    setCandidatePrompts({});
    setCandidateResolvedRules({});
    setCandidatePreflightWarnings({});
    setCandidateTextRatios({});
    setBlockedTargets({});
    setAppliedSelection([]);
    setCandidateDecisions({});
    setRunComplete(false);
    setCompareSource(true);
    setVersion("original");
    setNotice("Layer labels unlocked · downstream candidates cleared");
  }

  async function runPrototypeGeneration() {
    const targetId = draftSelection[0];
    if (!labelsConfirmed || !targetId) return;
    if (driveContext && !externalProcessingConsent) {
      setNotice("Authorize OpenAI processing before generating a Drive source.");
      return;
    }
    setSelectedPreviewId(targetId);
    setRunComplete(false);
    setGeneration("running");
    setGenerationStartedAt(Date.now());
    setElapsedSeconds(0);
    setNotice(`Generating ${targets.find((target) => target.id === targetId)?.size} from the confirmed label snapshot…`);
    try {
      const response = await fetch("/api/workspace/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(driveContext
          ? { labelsConfirmed: true, layerLabels: sourceLayers, targetIds: [targetId], jobId: driveContext.job.id, assetId: driveContext.asset.id, externalProcessingConsent }
          : { labelsConfirmed: true, layerLabels: sourceLayers, targetIds: [targetId], sourceAsset: SOURCE_ASSET }),
      });
      const result = await response.json() as {
        runId?: string;
        mode?: GenerationMode;
        candidates?: Array<{ id: string; src: string; status: string; model: string; quality: string; promptVersion: string; prompt: string; resolvedRules: ResolvedRule[]; preflightWarnings: string[]; suggestedTextRatio: number | null }>;
        blocked?: Array<{ id: string; status: "pass_to_designer"; ruleCodes: string[]; reasons: string[] }>;
        warning?: string | null;
        error?: string;
      };
      if (!response.ok || !result.candidates || !result.blocked || !result.mode || !result.runId) throw new Error(result.error ?? "Generation request failed.");
      const blocked = result.blocked[0];
      if (blocked) {
        setBlockedTargets((current) => ({ ...current, [blocked.id]: { ruleCodes: blocked.ruleCodes, reasons: blocked.reasons } }));
        setGenerationMode("pass_to_designer");
        setGeneration("idle");
        setGenerationStartedAt(null);
        setDraftSelection([]);
        setNotice(`${activeTarget?.size ?? blocked.id} failed preflight · Pass to designer`);
        return;
      }
      const candidate = result.candidates[0];
      if (!candidate) throw new Error("Generation returned no candidate.");
      setBlockedTargets((current) => { const next = { ...current }; delete next[candidate.id]; return next; });
      setAppliedSelection((current) => current.includes(candidate.id) ? current : [...current, candidate.id]);
      setGeneratedSources((current) => ({ ...current, [candidate.id]: candidate.src }));
      setGeneratedStatuses((current) => ({ ...current, [candidate.id]: candidate.status }));
      setCandidateModels((current) => ({ ...current, [candidate.id]: candidate.model }));
      setCandidateQualities((current) => ({ ...current, [candidate.id]: candidate.quality }));
      setCandidatePromptVersions((current) => ({ ...current, [candidate.id]: candidate.promptVersion }));
      setCandidatePrompts((current) => ({ ...current, [candidate.id]: candidate.prompt }));
      setCandidateResolvedRules((current) => ({ ...current, [candidate.id]: candidate.resolvedRules }));
      setCandidatePreflightWarnings((current) => ({ ...current, [candidate.id]: candidate.preflightWarnings }));
      if (candidate.suggestedTextRatio !== null) setCandidateTextRatios((current) => ({ ...current, [candidate.id]: candidate.suggestedTextRatio! }));
      setGenerationMode(result.mode);
      setGenerationRunIds((current) => ({ ...current, [candidate.id]: result.runId! }));
      setGeneration("ready");
      setGenerationStartedAt(null);
      setVersion("v1");
      setCompareSource(false);
      setNotice(result.warning ? `${activeTarget?.size ?? targetId} ready · ${result.warning}` : candidate.preflightWarnings.length ? `${activeTarget?.size ?? targetId} generated with ${candidate.preflightWarnings.length} preflight warning(s) · review required` : `${activeTarget?.size ?? targetId} is ready for Designer review`);
    } catch (err) {
      setGeneration("idle");
      setGenerationStartedAt(null);
      setNotice(err instanceof Error ? err.message : "Generation failed.");
    }
  }

  async function decideCandidate(decision: CandidateDecision) {
    if (!selectedPreview || !generationRunIds[selectedPreview.id]) return;
    const response = await fetch("/api/workspace/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(driveContext
        ? { runId: generationRunIds[selectedPreview.id], targetId: selectedPreview.id, decision, jobId: driveContext.job.id, assetId: driveContext.asset.id, promptVersion: selectedPromptVersion }
        : { runId: generationRunIds[selectedPreview.id], targetId: selectedPreview.id, decision, sourceAsset: SOURCE_ASSET, promptVersion: selectedPromptVersion }),
    });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setNotice(result.error ?? "Decision could not be saved.");
      return;
    }
    const nextDecisions = { ...candidateDecisions, [selectedPreview.id]: decision };
    setCandidateDecisions(nextDecisions);
    setGeneration("idle");
    setDraftSelection([]);
    setNotice(`${selectedPreview.size} ${decision === "adopted" ? "saved to Accepted tray" : "rejected"} · select another gap size`);
  }

  async function finishReview() {
    if (!allCandidatesReviewed) return;
    const responses = await Promise.all([...new Set(Object.values(generationRunIds))].map((runId) => fetch("/api/workspace/review", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(driveContext
        ? { runId, decision: "complete", jobId: driveContext.job.id, assetId: driveContext.asset.id, promptVersion: driveContext.prompt.versionId }
        : { runId, decision: "complete", sourceAsset: SOURCE_ASSET, promptVersion: DEFAULT_PROMPT_VERSION }),
    })));
    if (responses.some((response) => !response.ok)) return setNotice("Review could not be completed.");
    setRunComplete(true);
    setNotice(`MVP run complete · ${adoptedCount} adopted, ${appliedTargets.length - adoptedCount} rejected`);
  }

  function resetRun() {
    setSourceLayers([]);
    setAnalysisState("idle");
    setAnalysisModel(null);
    setAnalysisPrompt(null);
    setAnalysisTimeMs(null);
    setSelectedLayerZ(0);
    setLabelsConfirmed(false);
    setDraftSelection([]);
    setAppliedSelection([]);
    setSelectedPreviewId(defaultTargetId ?? "");
    setCompareSource(true);
    setAdjustmentMode(false);
    setVersion("original");
    setGeneration("idle");
    setGenerationMode(null);
    setGeneratedSources({});
    setGeneratedStatuses({});
    setGenerationRunIds({});
    setCandidateModels({});
    setCandidateQualities({});
    setCandidatePromptVersions({});
    setCandidatePrompts({});
    setCandidateResolvedRules({});
    setCandidatePreflightWarnings({});
    setCandidateTextRatios({});
    setBlockedTargets({});
    setGenerationStartedAt(null);
    setCandidateDecisions({});
    setRunComplete(false);
    setExternalProcessingConsent(false);
    setNotice(driveContext ? "New Drive source run started · authorization required" : "New NARAKA MVP run started");
  }

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <StatusPill tone="violet">{driveContext ? "Drive E2E Workspace" : "NARAKA E2E MVP"}</StatusPill>
            <span className="text-xs text-slate-400">{generationMode === "openai" ? "OpenAI-generated · Designer review required" : generationMode === "cache" ? "Cached candidate · no duplicate API cost" : generationMode === "pass_to_designer" ? "Preflight failed · Image API not called" : generationMode ? "Deterministic crop fallback · API issue logged" : "Vision analysis + OpenAI Image Edit"}</span>
          </div>
          <h1 className="truncate text-xl font-bold tracking-tight text-slate-950">{driveContext ? driveContext.job.clientName : "NARAKA · Character Key Art"}</h1>
          <p className="mt-1 text-sm text-slate-500">{sourceAssetLabel} · {driveContext?.asset.format ?? "PSD"} source · {driveContext?.job.industry ?? "Gaming"} · {driveContext?.job.creativeFormat ?? "RTB Banner"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="green">Source confirmed</StatusPill>
          <StatusPill tone={labelsConfirmed ? "green" : "amber"}>{labelsConfirmed ? "Labels confirmed" : "Confirmation required"}</StatusPill>
          {runComplete ? (
            <button type="button" onClick={resetRun} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700">Start another run</button>
          ) : appliedTargets.length > 0 && generation !== "running" ? (
            <button type="button" onClick={finishReview} disabled={!allCandidatesReviewed} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">
              Finish review · {reviewedCandidateCount}/{appliedTargets.length}
            </button>
          ) : (
            <span className="text-xs font-medium text-slate-400">{generation === "running" ? "Generating candidates…" : labelsConfirmed ? "Select missing sizes below" : analysisState === "ready" ? "Confirm object labels first" : "Run AI object analysis first"}</span>
          )}
        </div>
      </header>

      <section aria-label="Workflow progress" className="mb-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <ol className="flex min-w-[820px] items-center">
          {workflow.map((step, index) => (
            <li key={step.label} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${step.state === "done" ? "bg-emerald-600 text-white" : step.state === "active" ? "bg-violet-600 text-white ring-4 ring-violet-100" : "bg-slate-100 text-slate-400"}`}>
                  {step.state === "done" ? "✓" : index + 1}
                </span>
                <span className={`whitespace-nowrap text-xs font-semibold ${step.state === "active" ? "text-violet-700" : "text-slate-600"}`}>{step.label}</span>
              </div>
              {index < workflow.length - 1 && <span className="mx-3 h-px flex-1 bg-slate-200" />}
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(600px,1fr)_330px]">
        <aside className="self-start rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-5">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Detected objects</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Vision LLM detects visible objects from the flattened image. Click an object to correct its classification.</p>
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">
            <span>{sourceLayers.length ? `${sourceLayers.length} visible objects` : "Not analyzed"}</span>
            <span>{analysisModel ?? "Customer can override"}</span>
          </div>
          <div className="max-h-[470px] space-y-1 overflow-y-auto p-2.5">
            {analysisState === "running" && <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-center"><span className="mx-auto block h-7 w-7 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" /><p className="mt-3 text-xs font-bold text-violet-800">Vision LLM is detecting objects…</p><p className="mt-1 text-[10px] text-violet-600">Reading visible heroes, text, logo and compliance marks</p></div>}
            {analysisState !== "running" && sourceLayers.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><p className="text-xs font-semibold text-slate-700">No preloaded layer data</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Analyze {sourceAssetLabel} to create a real object inventory.</p></div>}
            {sourceLayers.map((layer) => {
              return (
                <button type="button" key={layer.z} onClick={() => setSelectedLayerZ(layer.z)} className={`w-full rounded-lg border px-3 py-2 text-left transition ${selectedLayerZ === layer.z ? "border-violet-300 bg-violet-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-5 font-mono text-[9px] text-slate-400">{layer.z}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{layer.name}</span>
                    {layer.decision === "corrected" && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">Customer edited</span>}
                    {layer.decision === "ignored" && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">Ignored</span>}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between pl-7">
                    <span className="text-xs font-bold text-violet-700">{layer.finalLabel}</span>
                    <span className="whitespace-nowrap text-[10px] text-slate-400">{layer.importance ?? layer.kind}{layer.confidence !== undefined ? ` · ${Math.round(layer.confidence * 100)}%` : ""}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 p-3">
            {selectedLayer ? <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="truncate text-xs font-bold text-slate-800">{selectedLayer.name}</p>
              <p className="mt-1 text-[10px] text-slate-500">Machine suggestion: <strong>{selectedLayer.machineLabel}</strong></p>
              <p className="mt-0.5 text-[10px] text-slate-400">Confidence {Math.round((selectedLayer.confidence ?? 0) * 100)}% · {selectedLayer.importance} · {selectedLayer.resizeBehavior}</p>
              {selectedLayer.visibleText && <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-600">Visible text: {selectedLayer.visibleText}</p>}
              <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Customer classification
                <select disabled={labelsConfirmed} value={selectedLayer.finalLabel} onChange={(event) => setSelectedLayerLabel(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100">
                  {["Hero", "Background", "Headline", "Supporting copy", "Supporting visual", "Brand logo", "App icon", "Compliance", "CTA", "Decorative", "Unclassified"].map((classification) => <option key={classification}>{classification}</option>)}
                </select>
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => reviewSelectedLayer("corrected")} disabled={labelsConfirmed || selectedLayer.finalLabel === "Unclassified" || selectedLayer.finalLabel === selectedLayer.machineLabel} className="rounded-lg bg-violet-600 px-2 py-2 text-[10px] font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-35">Save new classification</button>
                <button type="button" onClick={() => reviewSelectedLayer("ignored")} disabled={labelsConfirmed} className="rounded-lg border border-slate-300 px-2 py-2 text-[10px] font-semibold text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-35">Not an object · Ignore</button>
              </div>
            </div> : <div>
              {driveContext && <label className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] leading-4 text-amber-900"><input type="checkbox" checked={externalProcessingConsent} onChange={(event) => setExternalProcessingConsent(event.target.checked)} className="mt-0.5 accent-violet-600" /><span>I authorize sending this selected Drive image to OpenAI for object detection and candidate generation.</span></label>}
              <button type="button" onClick={analyzeSource} disabled={analysisState === "running" || Boolean(driveContext && !externalProcessingConsent)} className="w-full rounded-lg bg-violet-600 px-3 py-3 text-xs font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{analysisState === "error" ? "Retry AI object analysis" : `Analyze ${sourceAssetLabel} with AI`}</button>
            </div>}
            {labelsConfirmed ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-bold text-emerald-800">✓ Layer labels confirmed</p>
                <p className="mt-1 text-[10px] leading-4 text-emerald-700">This snapshot is now used for rules and candidate generation.</p>
                <button type="button" onClick={editLayerLabels} className="mt-2 text-[10px] font-semibold text-emerald-800 underline underline-offset-2">Edit labels and clear candidates</button>
              </div>
            ) : sourceLayers.length > 0 && (
              <button type="button" onClick={confirmLayerLabels} className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-700">Confirm all object labels & continue</button>
            )}
            {analysisState === "ready" && <p className="mt-2 text-[10px] leading-4 text-slate-400">{analysisTimeMs !== null ? `Analyzed in ${(analysisTimeMs / 1000).toFixed(1)}s · ` : ""}Machine labels and customer corrections remain separate in the snapshot.</p>}
            {analysisPrompt && <details className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2"><summary className="cursor-pointer text-[10px] font-semibold text-violet-700">View object-detection prompt</summary><p className="mt-2 text-[9px] leading-4 text-slate-500">{analysisPrompt}</p></details>}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-900">2. Select missing sizes</p>
                <p className="text-xs text-slate-400">Choose one gap, generate it, decide, then continue with another size</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill>Spec v2026.09</StatusPill>
                <StatusPill tone="violet">{draftSelection.length ? "1 size selected" : "Select 1 size"}</StatusPill>
                <button type="button" onClick={runPrototypeGeneration} disabled={!labelsConfirmed || draftSelection.length !== 1 || generation === "running"} className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">
                  {generation === "running" ? "Validating / generating…" : generatedSources[draftSelection[0]] ? "Validate & generate again" : "Validate & generate"}
                </button>
              </div>
            </div>
            {!labelsConfirmed && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">🔒 Confirm the detected layer labels before selecting or generating sizes.</div>
            )}
            {labelsConfirmed && generation !== "running" && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-800">MVP limitation: labels constrain the prompt, but the Image Edit API receives a flattened PNG. It may redraw details instead of moving original PSD pixels.</div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="w-12 px-4 py-2.5 font-semibold">Select</th>
                    <th className="px-4 py-2.5 font-semibold">Placement</th>
                    <th className="px-4 py-2.5 font-semibold">Required size</th>
                    <th className="px-4 py-2.5 font-semibold">Coverage</th>
                    <th className="px-4 py-2.5 font-semibold">Suggested route</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((target) => {
                    const selected = draftSelection.includes(target.id);
                    return (
                      <tr key={target.id} onClick={() => toggleTarget(target.id)} className={`border-t border-slate-100 transition ${labelsConfirmed && generation !== "running" && target.state !== "Covered" ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed opacity-45"} ${selected ? "bg-violet-50/50" : ""}`}>
                        <td className="px-4 py-3">
                          <input type="radio" name="target-size" checked={selected} disabled={!labelsConfirmed || generation === "running" || target.state === "Covered"} onChange={() => toggleTarget(target.id)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${target.size}`} className="h-4 w-4 accent-violet-600" />
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{target.placement}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{target.size}</td>
                        <td className="px-4 py-3"><StatusPill tone={candidateDecisions[target.id] === "adopted" ? "green" : candidateDecisions[target.id] === "rejected" || blockedTargets[target.id] || target.state === "Pending spec" || candidatePreflightWarnings[target.id]?.length ? "amber" : generatedSources[target.id] ? "violet" : target.state === "Covered" ? "green" : "violet"}>{candidateDecisions[target.id] === "adopted" ? "Accepted" : candidateDecisions[target.id] === "rejected" ? "Rejected" : blockedTargets[target.id] ? "Pass to designer" : generatedSources[target.id] && candidatePreflightWarnings[target.id]?.length ? "Generated · Needs review" : generatedSources[target.id] ? "Generated" : target.state}</StatusPill></td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{blockedTargets[target.id] ? "unable_to_generate" : target.route}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {Object.entries(blockedTargets).map(([targetId, blocked]) => (
              <div key={targetId} className="border-t border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2"><StatusPill tone="amber">Pass to designer</StatusPill><span className="whitespace-nowrap font-mono text-xs font-bold text-amber-900">{targetId}</span><span className="text-xs text-amber-800">No Image API call was made.</span></div>
                <ul className="mt-2 space-y-1 text-[11px] leading-4 text-amber-800">{blocked.reasons.map((reason, index) => <li key={blocked.ruleCodes[index] ?? reason}>• {reason} <span className="whitespace-nowrap font-mono text-[9px] text-amber-600">{blocked.ruleCodes[index]}</span></li>)}</ul>
              </div>
            ))}
            {Object.entries(candidatePreflightWarnings).filter(([, warnings]) => warnings.length > 0).map(([targetId, warnings]) => (
              <div key={targetId} className="border-t border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2"><StatusPill tone="amber">Generated · Needs review</StatusPill><span className="whitespace-nowrap font-mono text-xs font-bold text-amber-900">{targetId}</span><span className="text-xs text-amber-800">Candidate generated for your decision.</span></div>
                <ul className="mt-2 space-y-1 text-[11px] leading-4 text-amber-800">{warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-900">3. Candidate review</p>
                <p className="text-xs text-slate-400">Review one generated size at a time, then adopt or reject it</p>
              </div>
              {appliedTargets.length > 0 && generation !== "running" && <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => { const nextCompareSource = !compareSource; setCompareSource(nextCompareSource); setVersion(nextCompareSource ? "original" : "v1"); setAdjustmentMode(false); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${compareSource ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:border-violet-300"}`}>{compareSource ? "Back to candidate" : "View source"}</button>
                <button type="button" onClick={() => { setCompareSource(false); setVersion("v1"); setAdjustmentMode((current) => !current); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${adjustmentMode ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 text-slate-600 hover:border-violet-300"}`}>{adjustmentMode ? "Close adjustment" : "Move / resize object"}</button>
              </div>}
            </div>

            {runComplete && (
              <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-bold text-emerald-900">✓ NARAKA MVP run complete</p>
                <p className="mt-1 text-xs text-emerald-700">{adoptedCount} candidates adopted · {appliedTargets.length - adoptedCount} rejected · source and label snapshot preserved</p>
              </div>
            )}

            {generation === "running" && (
              <div role="status" aria-live="assertive" className="border-b border-violet-300 bg-gradient-to-r from-violet-700 to-indigo-700 px-5 py-5 text-white shadow-inner">
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 h-8 w-8 shrink-0 animate-spin rounded-full border-4 border-white/30 border-t-white" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold">Generating {activeTarget?.size ?? "candidate"}</p>
                      <span className="whitespace-nowrap font-mono text-sm font-bold">{elapsedSeconds}s elapsed</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-violet-100">{progressStage}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full w-1/3 animate-pulse rounded-full bg-white" /></div>
                    <p className="mt-2 text-[10px] text-violet-100">Please keep this page open. Complex Image Edit requests may take up to 2 minutes.</p>
                  </div>
                </div>
              </div>
            )}

            {adjustmentMode && appliedTargets.length > 0 && generation !== "running" && (
              <div className="grid gap-4 border-b border-violet-100 bg-violet-50/70 p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                {([["Horizontal", "x", -30, 30], ["Vertical", "y", -30, 30], ["Scale", "scale", 60, 140]] as const).map(([label, key, min, max]) => (
                  <label key={key} className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {label} · {adjustment[key]}{key === "scale" ? "%" : ""}
                    <input type="range" min={min} max={max} value={adjustment[key]} onChange={(event) => setAdjustment((current) => ({ ...current, [key]: Number(event.target.value) }))} className="mt-2 block w-full accent-violet-600" />
                  </label>
                ))}
                <button type="button" onClick={() => setAdjustment({ x: 0, y: 0, scale: 100 })} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:border-violet-400">Reset</button>
                <p className="md:col-span-4 text-[10px] leading-4 text-violet-700">
                  Editing <strong>{selectedLayer.name}</strong> ({selectedLayer.finalLabel}) on <strong>{targets.find((target) => target.id === selectedPreviewId)?.size}</strong>. This prototype moves the detected object boundary overlay; real pixel movement requires extracted PSD layers.
                </p>
              </div>
            )}

            {displayPreview ? (
              <div className="bg-slate-100 p-4">
                <article className="rounded-xl border border-violet-300 bg-white p-3 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-bold text-slate-900">{displayPreview.size}</p>
                        <StatusPill tone={displayPreview.tone}>{compareSource ? "Source reference" : generatedStatuses[displayPreview.id] === "deterministic_fallback" ? "Crop fallback" : "In review"}</StatusPill>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">{compareSource ? `Selected Drive source · ${sourceAssetLabel}` : `Main preview · RTB Banner · ${displayPreview.route}`}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-violet-600">{compareSource || version === "original" ? "Original reference" : `Candidate ${version}`}</span>
                  </div>
                  <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg bg-slate-950 p-4">
                    <div className="relative inline-flex max-h-[560px] max-w-full">
                      <Image src={displayPreview.src} alt={`${sourceAssetLabel} preview at ${displayPreview.size}`} width={displayPreview.width} height={displayPreview.height} className="max-h-[560px] h-auto w-auto max-w-full object-contain" priority unoptimized={displayPreview.src.startsWith("/api/")} />
                      {compareSource && selectedLayer?.bbox && <div className="pointer-events-none absolute border-2 border-cyan-300 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(15,23,42,.7)]" style={{ left: `${selectedLayer.bbox.x / 10}%`, top: `${selectedLayer.bbox.y / 10}%`, width: `${selectedLayer.bbox.width / 10}%`, height: `${selectedLayer.bbox.height / 10}%` }}><span className="absolute left-0 top-0 max-w-40 -translate-y-full whitespace-nowrap rounded-t bg-cyan-300 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">{selectedLayer.finalLabel} · {selectedLayer.name}</span></div>}
                    </div>
                    {adjustmentMode && !compareSource && (
                      <div className="pointer-events-none absolute left-1/2 top-1/2 grid h-[32%] w-[34%] place-items-center rounded border-2 border-violet-400 bg-violet-400/15 text-center text-[9px] font-bold text-white shadow-[0_0_0_999px_rgba(15,23,42,.08)]" style={{ transform: `translate(calc(-50% + ${adjustment.x}px), calc(-50% + ${adjustment.y}px)) scale(${adjustment.scale / 100})` }}>
                        {selectedLayer.finalLabel}<br />{selectedLayer.name}
                      </div>
                    )}
                  </div>
                  {appliedTargets.length > 0 && generation !== "running" && !compareSource && selectedPreview && !runComplete && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <button type="button" onClick={() => decideCandidate("adopted")} className={`rounded-lg px-4 py-2 text-xs font-bold text-white transition ${candidateDecisions[selectedPreview.id] === "adopted" ? "bg-emerald-700 ring-2 ring-emerald-200" : "bg-emerald-600 hover:bg-emerald-700"}`}>✓ Adopt this candidate</button>
                      <button type="button" onClick={() => decideCandidate("rejected")} className={`rounded-lg border px-4 py-2 text-xs font-bold transition ${candidateDecisions[selectedPreview.id] === "rejected" ? "border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-100" : "border-slate-300 text-slate-600 hover:border-rose-400 hover:text-rose-700"}`}>Reject</button>
                      <span className="ml-auto text-[10px] text-slate-400">{reviewedCandidateCount}/{appliedTargets.length} sizes decided</span>
                    </div>
                  )}
                </article>

                {appliedTargets.length > 0 && <div className="mt-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Generated experiments</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {appliedTargets.map((target) => (
                      <button type="button" key={target.id} onClick={() => { setCompareSource(false); setVersion("v1"); setSelectedPreviewId(target.id); setNotice(`Preview switched to ${target.size}`); }} className={`flex items-center gap-3 rounded-lg border p-2 text-left transition ${!compareSource && selectedPreview?.id === target.id ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:border-violet-300"}`}>
                        <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-950 p-1">
                          <Image src={generatedSources[target.id] ?? target.src} alt="" width={target.width} height={target.height} className="max-h-full h-auto w-auto max-w-full object-contain" unoptimized={(generatedSources[target.id] ?? target.src).startsWith("/api/workspace/")} />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-mono text-[11px] font-bold text-slate-800">{target.size}</span>
                          <span className={`mt-0.5 block truncate text-[9px] ${candidateDecisions[target.id] === "adopted" ? "text-emerald-600" : candidateDecisions[target.id] === "rejected" ? "text-rose-600" : "text-slate-400"}`}>{candidateDecisions[target.id] === "adopted" ? "Adopted" : candidateDecisions[target.id] === "rejected" ? "Rejected" : "Awaiting decision"}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>}

                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div><p className="text-xs font-bold text-emerald-900">Accepted tray</p><p className="mt-0.5 text-[10px] text-emerald-700">Accepted images stay here while you test another size.</p></div>
                    <StatusPill tone="green">{adoptedTargets.length} saved</StatusPill>
                  </div>
                  {adoptedTargets.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{adoptedTargets.map((target) => (
                    <button type="button" key={target.id} onClick={() => { setSelectedPreviewId(target.id); setCompareSource(false); setVersion("v1"); }} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white p-2 text-left hover:border-emerald-400">
                      <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-950 p-1"><Image src={generatedSources[target.id]} alt="" width={target.width} height={target.height} className="max-h-full h-auto w-auto max-w-full object-contain" unoptimized /></span>
                      <span><span className="block whitespace-nowrap font-mono text-[10px] font-bold text-slate-800">{target.size}</span><span className="text-[9px] font-semibold text-emerald-700">✓ Accepted</span></span>
                    </button>
                  ))}</div> : <p className="mt-3 rounded-lg border border-dashed border-emerald-300 bg-white/60 px-3 py-3 text-center text-[10px] text-emerald-700">Accept a candidate and it will be kept here.</p>}
                </div>
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center bg-slate-50 p-8 text-center">
                <div><p className="text-sm font-semibold text-slate-700">No sizes in preview</p><p className="mt-1 text-xs text-slate-400">Select at least one row above and apply the selection.</p></div>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-violet-200 bg-white shadow-sm">
            <div className="border-b border-violet-100 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">Prompt used</p>
                <StatusPill tone="violet">{driveContext?.prompt.resolution === "industry" ? "Industry prompt" : driveContext ? "General fallback" : "MVP prompt"}</StatusPill>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{driveContext ? `${driveContext.prompt.recipeName} · ${driveContext.prompt.resolution === "industry" ? "matched by industry" : "used because no active industry recipe matched"}` : "This NARAKA demo uses the tested code-resolved gaming prompt."}</p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-4 py-3 text-[10px]">
              <dt className="text-slate-400">Model</dt><dd className="break-all font-mono font-semibold text-slate-700">{selectedModel}</dd>
              <dt className="text-slate-400">Quality</dt><dd className="font-mono font-semibold text-slate-700">{selectedQuality}</dd>
              <dt className="text-slate-400">Version</dt><dd className="font-mono font-semibold text-slate-700">{selectedPromptVersion}</dd>
              <dt className="text-slate-400">Size</dt><dd className="font-mono font-semibold text-slate-700">{selectedPreview?.size ?? activeTarget?.size ?? "Select a gap"}</dd>
              <dt className="text-slate-400">Typography</dt><dd className="font-mono font-semibold text-slate-700">{selectedTextRatio === undefined ? "Adaptive" : `${Math.round(selectedTextRatio * 100)}% headline height`}</dd>
            </dl>
            <details className="group border-t border-violet-100 px-4 py-3" open={Boolean(selectedPrompt)}>
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-violet-700"><span>{selectedPrompt ? "View exact resolved prompt" : "Prompt appears after generation"}</span><span className="transition group-open:rotate-180">⌄</span></summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 font-mono text-[9px] leading-4 text-slate-200">{selectedPrompt ?? "The selected size, confirmed labels, layout constraints, and preservation rules will be resolved into the final prompt."}</pre>
            </details>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">Resolved rules</p>
                <StatusPill tone="violet">{selectedResolvedRules.length ? `${selectedResolvedRules.length} applied` : "Waiting"}</StatusPill>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">Chosen deterministically from target ratio and confirmed object labels</p>
            </div>
            <div className="divide-y divide-slate-100">
              {selectedResolvedRules.map((rule) => (
                <details key={rule.slug} className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="min-w-0 flex-1 text-xs font-semibold text-slate-700">{rule.statement}</span>
                    <span className="text-xs text-slate-400 transition group-open:rotate-180">⌄</span>
                  </summary>
                  <div className="ml-4 mt-2 rounded-lg bg-slate-50 p-2.5">
                    {rule.why && <p className="text-[10px] leading-4 text-slate-600">{rule.why}</p>}
                    <p className={`font-mono text-[9px] text-slate-400 ${rule.why ? "mt-1" : ""}`}>{rule.layer} · {rule.slug}</p>
                  </div>
                </details>
              ))}
              {selectedResolvedRules.length === 0 && <p className="px-4 py-4 text-[10px] leading-4 text-slate-400">Generate a size to see exactly which rules were selected and inserted into its prompt.</p>}
            </div>
            <div className="border-t border-slate-100 px-4 py-3 text-[10px] leading-4 text-slate-400">The LLM identifies objects; code selects rules. The LLM does not decide which policy applies.</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">Run snapshot</p>
                <p className="mt-0.5 text-xs text-slate-400">Inputs and decisions attached to this run</p>
              </div>
              <StatusPill tone={runComplete ? "green" : "violet"}>{runComplete ? "Complete" : appliedTargets.length > 0 ? "In review" : "Draft"}</StatusPill>
            </div>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 rounded-xl bg-slate-50 p-3 text-[11px]">
              <dt className="text-slate-500">Source</dt><dd className="max-w-40 truncate font-semibold text-slate-700" title={sourceAssetLabel}>{sourceAssetLabel}</dd>
              <dt className="text-slate-500">Object snapshot</dt><dd className={labelsConfirmed ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>{labelsConfirmed ? `${sourceLayers.length} confirmed` : "Not confirmed"}</dd>
              <dt className="text-slate-500">Generated sizes</dt><dd className="font-semibold text-slate-700">{appliedTargets.length}</dd>
              <dt className="text-slate-500">Decisions</dt><dd className="font-semibold text-slate-700">{reviewedCandidateCount}/{appliedTargets.length}</dd>
              <dt className="text-slate-500">Generation</dt><dd className="whitespace-nowrap font-semibold text-slate-700">{generationMode === "pass_to_designer" ? "Pass to designer" : generationMode === "deterministic_fallback" ? "Crop fallback" : generationMode === "cache" ? "Cache hit" : generationMode === "mixed" ? "Mixed" : generationMode === "openai" ? "OpenAI" : "Not started"}</dd>
              {selectedPreview && generationRunIds[selectedPreview.id] && <><dt className="text-slate-500">Selected run</dt><dd className="max-w-28 truncate font-mono text-[9px] text-slate-600" title={generationRunIds[selectedPreview.id]}>{generationRunIds[selectedPreview.id]}</dd></>}
            </dl>
            <div className="mt-3 space-y-2">
              {[
                { id: "original", title: "Original source", detail: "Drive PNG source · unchanged" },
                ...(appliedTargets.length > 0 ? [{ id: "v1", title: "Generated candidate", detail: generationMode === "deterministic_fallback" ? "Deterministic crop fallback · API issue logged" : "OpenAI output · Designer review required" }] : []),
              ].map((item) => (
                <button type="button" key={item.id} onClick={() => { setVersion(item.id); setCompareSource(item.id === "original"); setNotice(`Viewing ${item.title}`); }} className={`w-full rounded-xl border p-3 text-left transition ${version === item.id ? "border-violet-300 bg-violet-50" : "border-slate-100 hover:border-violet-200 hover:bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs font-semibold ${version === item.id ? "text-violet-800" : "text-slate-700"}`}>{item.title}</p>
                    {version === item.id && <span className="text-[10px] font-bold text-violet-600">VIEWING</span>}
                  </div>
                  <p className={`mt-0.5 text-[10px] ${version === item.id ? "text-violet-600" : "text-slate-400"}`}>{item.detail}</p>
                </button>
              ))}
            </div>
            {appliedTargets.length > 0 && generation !== "running" && !runComplete && (
              <button type="button" onClick={finishReview} disabled={!allCandidatesReviewed} className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">Finish review · {reviewedCandidateCount}/{appliedTargets.length}</button>
            )}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">The confirmed label snapshot, selected gaps, and customer decisions stay attached to this browser-session run.</div>
          </section>
        </aside>
      </div>

      <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-slate-200 bg-slate-950/95 px-4 py-2 text-xs font-medium text-white shadow-xl">
        {notice}
      </div>
    </main>
  );
}
