"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { SourceAssetCandidate } from "@/lib/source-assets";
import { formatBytes, formatDimensions } from "@/lib/format";
import { openWorkspaceAction } from "./actions";

export default function SourceAssetPicker({ jobId, candidates }: { jobId: string; candidates: SourceAssetCandidate[] }) {
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? "");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewRequestedId, setPreviewRequestedId] = useState<string | null>(null);
  const selected = candidates.find((candidate) => candidate.id === selectedId);

  return (
    <form action={openWorkspaceAction.bind(null, jobId)} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Detected source files</h2>
          <p className="mt-1 text-xs text-slate-500">PSD and master/source filenames are ranked first. Layer structure is checked only after selection.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {candidates.map((candidate, index) => (
            <label key={candidate.id} className={`flex cursor-pointer items-start gap-3 px-5 py-4 transition hover:bg-slate-50 ${selectedId === candidate.id ? "bg-violet-50/70" : ""}`}>
              <input type="radio" name="assetId" value={candidate.id} checked={selectedId === candidate.id} onChange={() => { setSelectedId(candidate.id); setPreviewFailed(false); setPreviewRequestedId(null); }} className="mt-1 h-4 w-4 accent-violet-600" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800">{candidate.filename}</span>
                  {index === 0 && <span className="whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Recommended source</span>}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span className="whitespace-nowrap">{candidate.format}</span>
                  <span className="whitespace-nowrap">{formatDimensions(candidate.psdCanvasW ?? candidate.width, candidate.psdCanvasH ?? candidate.height)}</span>
                  <span className="whitespace-nowrap">{formatBytes(candidate.fileSizeBytes)}</span>
                  <span>{candidate.sourceReason}</span>
                </span>
              </span>
            </label>
          ))}
          {candidates.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-500">No previewable PSD, PNG, or JPG source was found.</p>}
        </div>
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div><p className="text-sm font-bold text-slate-900">Source preview</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{selected?.filename ?? "Select a file"}</p></div>
          {selected && <span className="whitespace-nowrap rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600">Drive source</span>}
        </div>
        <div className="grid min-h-80 place-items-center overflow-hidden rounded-xl bg-slate-950 p-3">
          {selected && previewRequestedId === selected.id && !previewFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated runtime Drive preview
            <img src={`/api/assets/${selected.id}/preview`} alt={selected.filename} onError={() => setPreviewFailed(true)} className="max-h-[460px] max-w-full object-contain" />
          ) : <div className="max-w-xs text-center text-xs leading-5 text-slate-400"><p>{previewFailed ? "Preview unavailable. The file can still be selected." : "Preview is loaded only when requested, so the initial Drive scan stays fast."}</p>{selected && !previewFailed && <button type="button" onClick={() => setPreviewRequestedId(selected.id)} className="mt-3 whitespace-nowrap rounded-lg border border-slate-600 px-3 py-2 font-semibold text-slate-200 hover:border-slate-400">Load selected preview</button>}</div>}
        </div>
        <DeepInspectButton disabled={!selected} />
      </aside>
    </form>
  );
}

function DeepInspectButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="mt-4 w-full whitespace-nowrap rounded-lg bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">{pending ? "Downloading and analyzing selected source…" : "Analyze this source → Workspace Preview"}</button>;
}
