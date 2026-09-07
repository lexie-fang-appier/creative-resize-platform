"use client";

import { useState } from "react";
import type { AssetRow } from "@/lib/assets";
import { formatBytes, formatDimensions } from "@/lib/format";

/** Click-to-expand inline preview, per Lexie's request — no separate page,
 * no new tab. The <img> only renders once expanded (not just hidden), so
 * opening a PSD row is the trigger for the server to actually download +
 * flatten it, not something that happens for all 10-27 rows on page load. */
export default function AssetPreviewRow({ asset, striped }: { asset: AssetRow; striped: boolean }) {
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const rowClass = `border-b border-slate-100 last:border-b-0 ${asset.scanError ? "bg-red-50" : striped ? "bg-slate-50/50" : ""}`;

  return (
    <>
      <tr className={`${rowClass} cursor-pointer`} onClick={() => setOpen((v) => !v)}>
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
      </tr>
      {open && (
        <tr className={rowClass}>
          <td colSpan={8} className="px-4 py-3">
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
