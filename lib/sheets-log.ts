/**
 * Fire-and-forget audit log to a Google Sheet — separate from Postgres, which
 * stays the source of truth. Lexie wants a human-readable running log of job
 * creations and prompt saves she can glance at without opening the app.
 *
 * Never blocks or fails the caller: with no CREATIVE_RESIZE_LOG_SHEET_ID (or
 * in fixture mode, no GOOGLE_SERVICE_ACCOUNT_JSON) every function is a no-op;
 * a real API error is caught and only logged to the server console.
 */
import { google } from "googleapis";

const NEW_JOB_TAB = "New Job";
const PROMPTS_TAB = "Prompts";
const GENERATION_RUNS_TAB = "Generation Runs";

function getSheetsClient() {
  const spreadsheetId = process.env.CREATIVE_RESIZE_LOG_SHEET_ID;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!spreadsheetId || !raw) return null;

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { sheets: google.sheets({ version: "v4", auth: auth as unknown as string }), spreadsheetId };
}

async function appendRow(tab: string, row: Array<string | number | null>, required = false): Promise<void> {
  const client = getSheetsClient();
  if (!client) {
    if (required) throw new Error("Google Sheet logging is required but not configured.");
    return;
  }
  try {
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: `'${tab}'!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row.map((v) => v ?? "")] },
    });
  } catch (err) {
    console.error(`sheets-log: failed to append to "${tab}":`, err);
    if (required) throw err;
  }
}

export async function logNewJob(params: {
  jobId: string;
  clientName: string;
  industry: string | null;
  driveFolderUrl: string;
  adSolution: string;
  channel: string;
  creativeFormat: string;
  campaignInstruction: string | null;
  targetPlacements: string[];
  createdBy: string;
}): Promise<void> {
  await appendRow(NEW_JOB_TAB, [
    new Date().toISOString(),
    params.jobId,
    params.clientName,
    params.industry,
    params.driveFolderUrl,
    params.adSolution,
    params.channel,
    params.creativeFormat,
    params.campaignInstruction,
    params.targetPlacements.join(", "),
    params.createdBy,
  ]);
}

export async function logPromptVersion(params: {
  recipeId: string;
  recipeName: string;
  versionId: string;
  versionNumber: number;
  industry: string | null;
  creativeFormat: string | null;
  basePrompt: string;
  industryRules: string | null;
  layoutRules: string | null;
  requiredElements: string[];
  forbiddenChanges: string[];
  status: string;
  createdBy: string;
}): Promise<void> {
  await appendRow(PROMPTS_TAB, [
    new Date().toISOString(),
    params.recipeId,
    params.recipeName,
    params.versionId,
    params.versionNumber,
    params.industry,
    params.creativeFormat,
    params.basePrompt,
    params.industryRules,
    params.layoutRules,
    params.requiredElements.join(", "),
    params.forbiddenChanges.join(", "),
    params.status,
    params.createdBy,
  ]);
}

export async function logGenerationRun(params: {
  timestamp: string;
  runId: string;
  sourceAsset: string;
  targetSize: string;
  phase: string;
  status: string;
  model: string;
  quality: string;
  promptVersion: string;
  cacheKey: string;
  requestId: string | null;
  processingTimeMs: number;
  apiCostUsd: number | null;
  outputUri: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  actor: string;
  labelSnapshotHash: string;
  usageJson: string | null;
}): Promise<void> {
  await appendRow(GENERATION_RUNS_TAB, [
    params.timestamp,
    params.runId,
    params.sourceAsset,
    params.targetSize,
    params.phase,
    params.status,
    params.model,
    params.quality,
    params.promptVersion,
    params.cacheKey,
    params.requestId,
    params.processingTimeMs,
    params.apiCostUsd,
    params.outputUri,
    params.errorCode,
    params.errorMessage,
    params.actor,
    params.labelSnapshotHash,
    params.usageJson,
  ], true);
}
