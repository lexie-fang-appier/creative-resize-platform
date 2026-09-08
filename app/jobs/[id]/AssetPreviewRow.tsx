"use client";

import { useState } from "react";
import type { AssetRow } from "@/lib/assets";
import { formatBytes, formatDimensions } from "@/lib/format";

/** Click-to-expand inline preview (row click), plus a checkbox for manual
 * content-group selection (checkbox click, stopPropagation'd so it doesn't
 * also toggle the preview) — per Lexie's request. The <img> only renders
 * once expanded, so opening a PSD row is what triggers the actual
 * download+flatten, not something that happens for all rows on page load. */
export default function AssetPreviewRow({
  asset,
  striped,
  selected,
  onToggleSelected,
  groupName,
}: {
  asset: AssetRow;
  striped: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  groupName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const rowClass = `border-b border-slate-100 last:border-b-0 ${asset.scanError ? "bg-red-50" : striped ? "bg-slate-50/50" : ""}`;

  return (
    <>
      <tr className={`${rowClass} cursor-pointer`} onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelected} />
        </td>
        <td className="max-w-xs truncate px-4 py-2.5 font-medium text-slate-800" title={asset.filename}>
          <span className="mr-1 inline-block text-slate-400">{open ? "▾" : "▸"}</span>
          {asset.filename}
        </td>
        <td className="px-4 py-2.5 text-slate-600">{asset.format ?? asset.mimeType ?? "—"}</td>
        <td className="px-4 py-2.5 text-slate-600">{formatDimensions(asset.width, asset.height)}</td>
        <td className="px-4 py-2.5 text-slate-600">{formatBytes(asset.fileSizeBytes)}</td>
        <td className="px-4 py-2.5 text-slate-600">{asset.videoDurationSec != null ? `${asset.videoDurationSec}s` : "—"}</td>
        <td className="px-4 py-2.5 text-slate-600">{formatDimensions(asset.psdCanvasW, asset.psdCanvasH)}</td>
        <td className="px-4 py-2.5 text-slate-600">{asset.redesignEligible == null ? "—" : asset.redesignEligible ? "Yes" : "No"}</td>
        <td className="px-4 py-2.5 text-red-700">{asset.scanError ?? ""}</td>
        <td className="px-4 py-2.5">
          {groupName ? (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
              {groupName}
            </span>
          ) : (
            <span className="text-xs text-slate-300">ungrouped</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className={rowClass}>
          <td colSpan={9} className="px-4 py-3">
            {imgFailed ? (
              <p className="text-xs text-slate-400">No preview available for this asset (see console/network tab for the reason).</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- server-rendered per-request, not a static asset Next can optimize
              <img
                src={`/api/assets/${asset.id}/preview`}
                alt={asset.filename}
                className="max-h-96 rounded-md border border-slate-200 object-contain"
                onError={() => setImgFailed(true)}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}
