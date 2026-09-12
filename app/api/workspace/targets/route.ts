import { NextResponse } from "next/server";
import { requireSessionEmail } from "@/lib/require-session";
import { listGenerationTargets } from "@/lib/specs";

export const runtime = "nodejs";

const DEVICE_LABEL: Record<string, string> = {
  pc_mobile: "PC + Mobile",
  pc_only: "PC only",
  mobile_only: "Mobile only",
};

/** The Workspace's target list, derived from spec_dimensions rather than kept as
 * a constant in the page. The list it used to hold had already lost touch with
 * the seeded specs, and nothing would have reported it. */
export async function GET() {
  try { await requireSessionEmail(); } catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }
  const targets = (await listGenerationTargets()).map((target) => {
    const provisional = target.mustHaveLevel === "provisional";
    const appIconSlot = target.placement === "Native" && target.width === target.height && target.width <= 256;
    return {
      id: target.id,
      size: `${target.width} × ${target.height}`,
      width: target.width,
      height: target.height,
      placement: `RTB ${target.placement} · ${DEVICE_LABEL[target.deviceScope] ?? target.deviceScope}`,
      state: provisional ? "Pending spec" : "Gap",
      route: provisional ? "pending_spec_confirmation" : appIconSlot ? "separate_asset_check" : "preflight_required",
      qa: provisional ? "Provisional" : "Required",
      tone: provisional ? "amber" : "violet",
    };
  });
  return NextResponse.json({ targets });
}
