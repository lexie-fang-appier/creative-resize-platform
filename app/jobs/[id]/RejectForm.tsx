"use client";

import { useActionState, useState } from "react";
import { REJECTION_REASONS } from "@/lib/review-reasons";
import { rejectAction, type RejectFormState } from "./review-actions";

const initialState: RejectFormState = {};

export default function RejectForm({ jobId, generationRunId }: { jobId: string; generationRunId: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = rejectAction.bind(null, jobId, generationRunId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50"
      >
        Reject
      </button>
    );
  }

  return (
    <form action={formAction} className="w-64 space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
      {state.error && <p className="text-xs text-red-800">{state.error}</p>}
      <select name="rejectionReason" required className="w-full rounded border border-slate-300 px-2 py-1 text-xs" defaultValue="">
        <option value="" disabled>
          Reason…
        </option>
        {REJECTION_REASONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <textarea name="designerComment" placeholder="Optional comment" rows={2} className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-red-800 disabled:opacity-50"
        >
          {pending ? "Rejecting…" : "Confirm reject"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
