import { getServerSession } from "next-auth";
import { getAsset } from "@/lib/assets";
import { getAssetPreview } from "@/lib/asset-preview";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const preview = await getAssetPreview(asset);
  if (!preview.ok) return NextResponse.json({ error: preview.reason }, { status: 422 });

  return new NextResponse(new Uint8Array(preview.buffer), { headers: { "content-type": preview.contentType } });
}
