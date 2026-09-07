"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { activateVersion, cloneRecipe, createVersion } from "@/lib/prompts";

export interface VersionFormState {
  error?: string;
}

function splitLines(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createVersionAction(recipeId: string, _prevState: VersionFormState, formData: FormData): Promise<VersionFormState> {
  const basePrompt = String(formData.get("basePrompt") ?? "").trim();
  if (!basePrompt) return { error: "Base prompt is required." };

  await createVersion(recipeId, {
    basePrompt,
    industryRules: String(formData.get("industryRules") ?? "").trim() || null,
    layoutRules: String(formData.get("layoutRules") ?? "").trim() || null,
    requiredElements: splitLines(formData.get("requiredElements")),
    forbiddenChanges: splitLines(formData.get("forbiddenChanges")),
    validationRules: splitLines(formData.get("validationRules")),
    createdBy: "dev-designer",
    publish: formData.get("publish") === "true",
  });

  revalidatePath(`/prompts/${recipeId}`);
  redirect(`/prompts/${recipeId}`);
}

export async function activateVersionAction(recipeId: string, versionId: string): Promise<void> {
  await activateVersion(recipeId, versionId);
  revalidatePath(`/prompts/${recipeId}`);
}

export interface CloneFormState {
  error?: string;
}

export async function cloneRecipeAction(recipeId: string, _prevState: CloneFormState, formData: FormData): Promise<CloneFormState> {
  const newName = String(formData.get("newName") ?? "").trim();
  if (!newName) return { error: "New recipe name is required." };
  const newId = await cloneRecipe(recipeId, newName, "dev-designer");
  redirect(`/prompts/${newId}`);
}
