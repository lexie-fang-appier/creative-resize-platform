"use client";

import { useActionState } from "react";
import type { PlacementOption } from "@/lib/specs";
import { createJobAction, type CreateJobState } from "./actions";

const initialState: CreateJobState = {};

export default function NewJobForm({ placements }: { placements: PlacementOption[] }) {
  const [state, formAction, pending] = useActionState(createJobAction, initialState);

  // Populated from spec_versions, not hardcoded — see lib/specs.ts. ad_solution
  // and channel are no longer asked here at all: today every spec_version
  // shares (RTB, Global), so the server derives it (soleAdSolutionAndChannel())
  // instead of making the Designer pick from a one-item dropdown. If a second
  // pair ever gets seeded, that function throws loudly and this form needs an
  // explicit selector brought back — not silently guessed.
  const placementNames = [...new Set(placements.map((p) => p.placement))];

  const label = "block text-sm font-medium text-slate-700 mb-1.5";
  const input =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400";

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>
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
          autoFocus
          placeholder="https://drive.google.com/drive/folders/..."
          className={input}
        />
      </div>

      <fieldset>
        <legend className={label}>Target placements</legend>
        <div className="flex flex-wrap gap-2">
          {placementNames.map((p) => (
            <label
              key={p}
              className="has-[:checked]:border-slate-900 has-[:checked]:bg-slate-900 has-[:checked]:text-white flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400"
            >
              <input type="checkbox" name="targetPlacements" value={p} className="sr-only" />
              {p}
            </label>
          ))}
        </div>
        {placementNames.length === 0 && (
          <p className="text-sm text-slate-500">No spec_versions in the database yet — run db/migrate.sh.</p>
        )}
      </fieldset>

      <details className="group rounded-md border border-slate-200">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-600 marker:content-none">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span> Optional details (client
          name, industry, campaign instruction)
        </summary>
        <div className="space-y-4 border-t border-slate-200 px-3 py-4">
          <div>
            <label className={label} htmlFor="clientName">
              Client <span className="font-normal text-slate-400">— defaults to the Drive folder&rsquo;s name</span>
            </label>
            <input id="clientName" name="clientName" type="text" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="industry">
              Industry
            </label>
            <input id="industry" name="industry" type="text" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="campaignInstruction">
              Campaign instruction
            </label>
            <textarea id="campaignInstruction" name="campaignInstruction" rows={4} className={input} />
          </div>
        </div>
      </details>

      <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create Job"}
        </button>
        <span className="text-xs text-slate-400">Scans the folder and computes the Gap Matrix immediately.</span>
      </div>
    </form>
  );
}
