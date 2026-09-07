"use client";

import { useActionState } from "react";
import type { Industry } from "@/lib/industries";
import { createRecipeAction, type CreateRecipeState } from "./actions";

const initialState: CreateRecipeState = {};

export default function NewRecipeForm({
  industries,
  creativeFormats,
  globalSafetyRules,
}: {
  industries: Industry[];
  creativeFormats: string[];
  globalSafetyRules: string;
}) {
  const [state, formAction, pending] = useActionState(createRecipeAction, initialState);

  const label = "block text-sm font-medium text-slate-700 mb-1.5";
  const input =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400";
  const textarea = input + " font-mono text-xs leading-5";

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>
      )}

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
        <span className="font-semibold text-slate-600">Always applied first, not editable here:</span> {globalSafetyRules}
      </div>

      <div>
        <label className={label} htmlFor="name">
          Recipe name
        </label>
        <input id="name" name="name" type="text" required className={input} placeholder="e.g. Health Supplement — Banner short-wide" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={label} htmlFor="industry">
            Industry
          </label>
          <select id="industry" name="industry" className={input} defaultValue="">
            <option value="">Select…</option>
            {industries.map((i) => (
              <option key={i.id} value={i.name}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="creativeFormat">
            Creative format
          </label>
          <select id="creativeFormat" name="creativeFormat" className={input} defaultValue="">
            <option value="">Select…</option>
            {creativeFormats.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="sourceType">
            Source type
          </label>
          <input id="sourceType" name="sourceType" type="text" className={input} placeholder="e.g. PSD" />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="aspectRatioCategory">
          Aspect-ratio category
        </label>
        <input
          id="aspectRatioCategory"
          name="aspectRatioCategory"
          type="text"
          className={input}
          placeholder="e.g. short-wide (per 16 Ref: split into two zones, oversize UI elements)"
        />
      </div>

      <div>
        <label className={label} htmlFor="applicableTargetSizesRaw">
          Applicable target sizes <span className="font-normal text-slate-400">— comma-separated, informational for now</span>
        </label>
        <input id="applicableTargetSizesRaw" name="applicableTargetSizesRaw" type="text" className={input} placeholder="640x960, 672x560" />
      </div>

      <div>
        <label className={label} htmlFor="basePrompt">
          Base prompt
        </label>
        <textarea id="basePrompt" name="basePrompt" rows={4} required className={textarea} />
      </div>
      <div>
        <label className={label} htmlFor="industryRules">
          Industry rules
        </label>
        <textarea id="industryRules" name="industryRules" rows={4} className={textarea} placeholder="e.g. from 16 Ref's per-industry checklist" />
      </div>
      <div>
        <label className={label} htmlFor="layoutRules">
          Layout rules
        </label>
        <textarea id="layoutRules" name="layoutRules" rows={4} className={textarea} placeholder="e.g. element retention priority order, modular vs. unified-graphic branch" />
      </div>
      <div>
        <label className={label} htmlFor="requiredElements">
          Required elements <span className="font-normal text-slate-400">— one per line</span>
        </label>
        <textarea id="requiredElements" name="requiredElements" rows={3} className={textarea} placeholder={"Logo\nCTA\nCompliance badge"} />
      </div>
      <div>
        <label className={label} htmlFor="forbiddenChanges">
          Forbidden changes <span className="font-normal text-slate-400">— one per line</span>
        </label>
        <textarea id="forbiddenChanges" name="forbiddenChanges" rows={3} className={textarea} placeholder={"Rewriting copy\nChanging the logo"} />
      </div>
      <div>
        <label className={label} htmlFor="validationRules">
          Validation rules <span className="font-normal text-slate-400">— one per line</span>
        </label>
        <textarea id="validationRules" name="validationRules" rows={3} className={textarea} />
      </div>

      <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create Recipe"}
        </button>
      </div>
    </form>
  );
}
