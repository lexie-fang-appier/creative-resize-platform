/**
 * Ported verbatim (geometric retention-rate -> route-bucket logic) from
 * classifier/retention.py (07 Flow §10-1: 分流規則，用保留率單一指標決定).
 *
 * 保留率 = min(Rs, Rt) / max(Rs, Rt), where Rs/Rt are source/target width:height
 * ratios. This is a rule, not a statistic — given any two ratios it's fully
 * determined, independent of sample data or finished-asset contamination.
 *
 * R0 純縮放   (>=98%)      -> scale only,      全自動
 * R2 輕度裁切 (>=80%)      -> crop-fill,       自動產出+人確認
 * R3 中度裁切 (>=60%)      -> crop-fill,       自動產出但標警示
 * R1 方向翻轉 (landscape<->portrait, any %) -> 一定要設計師重排
 * R4 重度裁切 (<60%)       -> 一定要設計師重排
 *
 * "直的變橫的一定要重排不需要另外寫判斷" doesn't hold automatically from the ratio
 * math alone (a portrait source can numerically retain >=80% against a landscape
 * target) — the rule is an explicit orientation override, so R1 is checked before
 * the retention-rate thresholds, not derived from them.
 *
 * ⚠️ FALLBACK, PENDING CONFIRMATION — not the final production crop-fill logic.
 * Appier internally has DayDay's `creative-advisor` service (4 detectors —
 * face/text/subject/saliency — union bbox, crop only outside it; measured 0
 * important-content crops across a 100-image test, much smarter than this
 * module's "center crop", which was empirically shown to crop into text on real
 * tickets CAM-406076 / CAM-405162).
 *
 * Lexie's decision (see 28 Technical Plan §17/§22-Q3): eligible_crop_fill /
 * manual_rearrange routing should ultimately be decided by Creative Advisor's
 * `POST /crop-fill-decisions` response (does the crop cut into a detected
 * important region), not the retention percentage computed here. Whether that API
 * is actually callable from this new service is UNVERIFIED — an open question
 * tracked in the vault plan doc, not resolved by this scaffold. Until it's
 * confirmed, this module is the local fallback/first-pass only; it is not wired
 * to be the authoritative router if/when the Creative Advisor API integration
 * lands.
 */

export const R0 = "R0_純縮放_全自動";
export const R2 = "R2_輕度裁切_自動+確認";
export const R3 = "R3_中度裁切_自動+警示";
export const R1 = "R1_方向翻轉_需重排";
export const R4 = "R4_重度裁切_需重排";

export const AUTOMATABLE = new Set([R0, R2]); // can ship without a human touching layout
export const NEEDS_DESIGNER = new Set([R1, R4]); // 07 Flow: "一定要設計師"
export const NEEDS_WARNING_REVIEW = new Set([R3]); // auto output, but flagged for a human look

const RANK: Record<string, number> = { [R0]: 0, [R2]: 1, [R3]: 2, [R4]: 3, [R1]: 3 };

export type WH = [number, number];

/** source/target: [width, height]. Returns [routeCode, retentionPct]. */
export function computeRoute(source: WH, target: WH): [string, number] {
  const [sw, sh] = source;
  const [tw, th] = target;
  const sourceIsLandscape = sw >= sh;
  const targetIsLandscape = tw >= th;
  if (sourceIsLandscape !== targetIsLandscape) return [R1, 0];

  const ratioS = sw / sh;
  const ratioT = tw / th;
  const retention = Math.min(ratioS, ratioT) / Math.max(ratioS, ratioT);
  const pct = Math.round(retention * 100);

  if (retention >= 0.98) return [R0, pct];
  if (retention >= 0.8) return [R2, pct];
  if (retention >= 0.6) return [R3, pct];
  return [R4, pct];
}

/** Try every available source, keep whichever gives the best (lowest-risk) route
 * for this one target. Returns [routeCode, retentionPct, sourceWH], or null if
 * `sources` is empty. */
export function bestRouteForTarget(sources: WH[], target: WH): [string, number, WH] | null {
  let best: [string, number, WH] | null = null;
  for (const s of sources) {
    const [route, pct] = computeRoute(s, target);
    if (best === null || RANK[route] < RANK[best[0]]) best = [route, pct, s];
  }
  return best;
}

export interface TargetDetail {
  target: WH;
  route: string;
  retentionPct: number;
  bestSource: WH | null;
}

export interface TargetsSummary {
  detail: TargetDetail[];
  automatable: number;
  warn: number;
  manual: number;
  total: number;
}

/** Run bestRouteForTarget for every target, return per-route tallies plus the raw
 * per-target detail — the shape the Gap module / UI consume. */
export function summarizeTargets(sources: WH[], targets: WH[]): TargetsSummary {
  const detail: TargetDetail[] = targets.map((t) => {
    const best = bestRouteForTarget(sources, t);
    return {
      target: t,
      route: best ? best[0] : R4,
      retentionPct: best ? best[1] : 0,
      bestSource: best ? best[2] : null,
    };
  });
  const nAuto = detail.filter((d) => AUTOMATABLE.has(d.route)).length;
  const nWarn = detail.filter((d) => NEEDS_WARNING_REVIEW.has(d.route)).length;
  const nManual = detail.filter((d) => NEEDS_DESIGNER.has(d.route)).length;
  return { detail, automatable: nAuto, warn: nWarn, manual: nManual, total: targets.length };
}
