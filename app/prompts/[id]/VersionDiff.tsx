"use client";

import { useState } from "react";
import { diffLines } from "diff";
import type { PromptVersion } from "@/lib/prompts";

function versionText(v: PromptVersion): string {
  return [
    `Base prompt:\n${v.basePrompt}`,
    `Industry rules:\n${v.industryRules ?? ""}`,
    `Layout rules:\n${v.layoutRules ?? ""}`,
    `Required elements:\n${v.requiredElements.join("\n")}`,
    `Forbidden changes:\n${v.forbiddenChanges.join("\n")}`,
    `Validation rules:\n${v.validationRules.join("\n")}`,
  ].join("\n\n");
}

export default function VersionDiff({ versions }: { versions: PromptVersion[] }) {
  const [fromId, setFromId] = useState(versions[Math.min(1, versions.length - 1)]?.id ?? "");
  const [toId, setToId] = useState(versions[0]?.id ?? "");

  if (versions.length < 2) {
    return <p className="text-sm text-slate-400">Need at least two versions to diff.</p>;
  }

  const from = versions.find((v) => v.id === fromId);
  const to = versions.find((v) => v.id === toId);
  const parts = from && to ? diffLines(versionText(from), versionText(to)) : [];

  const select = "rounded-md border border-slate-300 px-2 py-1 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <select className={select} value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versionNumber} ({v.status})
            </option>
          ))}
        </select>
        <span>→</span>
        <select className={select} value={toId} onChange={(e) => setToId(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versionNumber} ({v.status})
            </option>
          ))}
        </select>
      </div>
      <pre className="max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5">
        {parts.map((part, i) => (
          <span
            key={i}
            className={part.added ? "block bg-emerald-100 text-emerald-900" : part.removed ? "block bg-red-100 text-red-900" : "block text-slate-500"}
          >
            {part.value}
          </span>
        ))}
      </pre>
    </div>
  );
}
