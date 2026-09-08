"use client";

import { useState, useTransition } from "react";
import type { AssetGroup } from "@/lib/asset-groups";
import type { AssetRow } from "@/lib/assets";
import AssetPreviewRow from "./AssetPreviewRow";
import { createGroupAction, deleteGroupAction } from "./group-actions";

export default function AssetInventoryTable({ jobId, assets, groups }: { jobId: string; assets: AssetRow[]; groups: AssetGroup[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [pending, startTransition] = useTransition();

  const assetToGroupName = new Map<string, string>();
  for (const g of groups) for (const assetId of g.assetIds) assetToGroupName.set(assetId, g.name);

  function toggle(assetId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  function handleCreateGroup() {
    const name = groupName.trim();
    if (!name || selected.size === 0) return;
    const assetIds = [...selected];
    startTransition(async () => {
      await createGroupAction(jobId, name, assetIds);
      setSelected(new Set());
      setGroupName("");
    });
  }

  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-semibold"></th>
            <th className="px-4 py-3 font-semibold">Filename</th>
            <th className="px-4 py-3 font-semibold">Format</th>
            <th className="px-4 py-3 font-semibold">Dimensions</th>
            <th className="px-4 py-3 font-semibold">File Size</th>
            <th className="px-4 py-3 font-semibold">Video Duration</th>
            <th className="px-4 py-3 font-semibold">PSD Canvas</th>
            <th className="px-4 py-3 font-semibold">Redesign Eligible</th>
            <th className="px-4 py-3 font-semibold">Scan Error</th>
            <th className="px-4 py-3 font-semibold">Group</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a, i) => (
            <AssetPreviewRow
              key={a.id}
              asset={a}
              striped={i % 2 === 1}
              selected={selected.has(a.id)}
              onToggleSelected={() => toggle(a.id)}
              groupName={assetToGroupName.get(a.id) ?? null}
            />
          ))}
          {assets.length === 0 && (
            <tr>
              <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                No assets scanned yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        <span className="text-xs text-slate-500">{selected.size} selected</span>
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Group name (e.g. Ridgeline Invest concept)"
          className="rounded-md border border-slate-300 px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
        />
        <button
          type="button"
          onClick={handleCreateGroup}
          disabled={pending || selected.size === 0 || !groupName.trim()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-40"
        >
          {pending ? "Creating…" : "Group selected assets"}
        </button>

        {groups.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {groups.map((g) => (
              <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-700">
                {g.name} ({g.assetIds.length})
                <button
                  type="button"
                  onClick={() => startTransition(() => deleteGroupAction(jobId, g.id))}
                  className="text-violet-400 hover:text-violet-700"
                  title="Delete this group"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
