import { getServerSession } from "next-auth";
import fs from "node:fs/promises";
import path from "node:path";
import { OUTPUT_DIR } from "@/lib/creative-analysis";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { isSafeWorkspaceOutputFilename } from "@/lib/workspace-output";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { filename } = await params;
  if (!isSafeWorkspaceOutputFilename(filename)) return NextResponse.json({ error: "Invalid filename." }, { status: 400 });
  try {
    const image = await fs.readFile(path.join(process.cwd(), ...OUTPUT_DIR, filename));
    return new NextResponse(new Uint8Array(image), { headers: { "content-type": "image/png", "cache-control": "private, max-age=31536000, immutable" } });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
