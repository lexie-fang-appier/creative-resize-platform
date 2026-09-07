/**
 * Serves files from outputs/ (gitignored — real client creative derivatives,
 * never committed). Exists because generation_runs.output_asset_uri needs to
 * be something a browser can actually load; a `file://` path just silently
 * fails when clicked from a page served over http(s) — browsers block that
 * navigation for security reasons. This is a stopgap for local dev before
 * Drive write-back exists (28 Technical Plan §6/§14: outputs eventually go
 * to a Drive draft/approved folder, not disk) — no auth here matches the
 * rest of Phase 1 (nothing is auth-gated yet), not a deliberate choice to
 * leave this open long-term.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const OUTPUTS_DIR = path.join(process.cwd(), "outputs");

export async function GET(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  // Reject anything that isn't a bare filename — no traversal out of outputs/.
  if (filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename." }, { status: 400 });
  }
  const filePath = path.join(OUTPUTS_DIR, filename);
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";
    return new NextResponse(new Uint8Array(data), { headers: { "content-type": contentType } });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
