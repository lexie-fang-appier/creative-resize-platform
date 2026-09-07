"use client";

import { useActionState } from "react";
import type { PromptVersion } from "@/lib/prompts";
import { createVersionAction, type VersionFormState } from "./actions";

const initialState: VersionFormState = {};

export default function NewVersionForm({ recipeId, latest }: { recipeId: string; latest: PromptVersion | null }) {
  const boundAction = createVersionAction.bind(null, recipeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const label = "block text-sm font-medium text-slate-700 mb-1.5";
  const input =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 font-mono text-xs leading-5";

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>
      )}
      <div>
        <label className={label} htmlFor="basePrompt">
          Base prompt
        </label>
        <textarea id="basePrompt" name="basePrompt" rows={4} required defaultValue={latest?.basePrompt ?? ""} className={input} />
      </div>
      <div>
        <label className={label} htmlFor="industryRules">
          Industry rules
        </label>
        <textarea id="industryRules" name="industryRules" rows={4} defaultValue={latest?.industryRules ?? ""} className={input} />
      </div>
      <div>
        <label className={label} htmlFor="layoutRules">
          Layout rules
        </label>
        <textarea id="layoutRules" name="layoutRules" rows={4} defaultValue={latest?.layoutRules ?? ""} className={input} />
      </div>
      <div>
        <label className={label} htmlFor="requiredElements">
          Required elements <span className="font-normal text-slate-400">— one per line</span>
        </label>
        <textarea
          id="requiredElements"
          name="requiredElements"
          rows={3}
          defaultValue={(latest?.requiredElements ?? []).join("\n")}
          className={input}
        />
      </div>
      <div>
        <label className={label} htmlFor="forbiddenChanges">
          Forbidden changes <span className="font-normal text-slate-400">— one per line</span>
        </label>
        <textarea
          id="forbiddenChanges"
          name="forbiddenChanges"
          rows={3}
          defaultValue={(latest?.forbiddenChanges ?? []).join("\n")}
          className={input}
        />
      </div>
      <div>
        <label className={label} htmlFor="validationRules">
          Validation rules <span className="font-normal text-slate-400">— one per line</span>
        </label>
        <textarea
          id="validationRules"
          name="validationRules"
          rows={3}
          defaultValue={(latest?.validationRules ?? []).join("\n")}
          className={input}
        />
      </div>
      <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
        <button
          type="submit"
          name="publish"
          value="false"
          disabled={pending}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          Save as draft
        </button>
        <button
          type="submit"
          name="publish"
          value="true"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          Publish now
        </button>
        <span className="text-xs text-slate-400">Publishing archives the current active version — it stays visible in history.</span>
      </div>
    </form>
  );
}
