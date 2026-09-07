"use client";

import { useActionState } from "react";
import type { PlacementOption } from "@/lib/specs";
import { createJobAction, type CreateJobState } from "./actions";

const initialState: CreateJobState = {};

export default function NewJobForm({ placements }: { placements: PlacementOption[] }) {
  const [state, formAction, pending] = useActionState(createJobAction, initialState);

  // Populated from spec_versions, not hardcoded — see lib/specs.ts.
  const adSolutions = [...new Set(placements.map((p) => p.adSolution))];
  const channels = [...new Set(placements.map((p) => p.channel))];
  const creativeFormats = [...new Set(placements.map((p) => p.creativeFormat))];
  const placementNames = [...new Set(placements.map((p) => p.placement))];

  const label = "block text-sm font-medium text-slate-700 mb-1";
  const input = "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <form action={formAction} className="space-y-5 max-w-2xl">
      {state.error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>
      )}

      <div>
        <label className={label} htmlFor="driveFolderUrl">
          Drive folder URL
        </label>
        <input
          id="driveFolderUrl"
          name="driveFolderUrl"
          type="text"
          required
          placeholder="https://drive.google.com/drive/folders/..."
          className={input}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="clientName">
            Client
          </label>
          <input id="clientName" name="clientName" type="text" required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="industry">
            Industry
          </label>
          <input id="industry" name="industry" type="text" className={input} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={label} htmlFor="adSolution">
            Ad solution
          </label>
          <select id="adSolution" name="adSolution" required className={input} defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {adSolutions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="channel">
            Channel
          </label>
          <select id="channel" name="channel" required className={input} defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {channels.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="creativeFormat">
            Creative format
          </label>
          <select id="creativeFormat" name="creativeFormat" required className={input} defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {creativeFormats.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className={label}>Target placements</legend>
        <div className="flex flex-wrap gap-4">
          {placementNames.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="targetPlacements" value={p} />
              {p}
            </label>
          ))}
        </div>
        {placementNames.length === 0 && (
          <p className="text-sm text-slate-500">No spec_versions in the database yet — run db/migrate.sh.</p>
        )}
      </fieldset>

      <div>
        <label className={label} htmlFor="campaignInstruction">
          Campaign instruction
        </label>
        <textarea id="campaignInstruction" name="campaignInstruction" rows={4} className={input} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create Job"}
      </button>
    </form>
  );
}
