"use client";

import { useActionState } from "react";
import { cloneRecipeAction, type CloneFormState } from "./actions";

const initialState: CloneFormState = {};

export default function CloneForm({ recipeId }: { recipeId: string }) {
  const boundAction = cloneRecipeAction.bind(null, recipeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        name="newName"
        type="text"
        required
        placeholder="New recipe name"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Cloning…" : "Clone this recipe's active version into a new recipe"}
      </button>
      {state.error && <span className="text-sm text-red-700">{state.error}</span>}
    </form>
  );
}
