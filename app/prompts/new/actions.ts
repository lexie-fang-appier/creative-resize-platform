"use server";

import { redirect } from "next/navigation";
import { createRecipe } from "@/lib/prompts";

export interface CreateRecipeState {
  error?: string;
}

function splitLines(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createRecipeAction(_prevState: CreateRecipeState, formData: FormData): Promise<CreateRecipeState> {
  const name = String(formData.get("name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim() || null;
  const creativeFormat = String(formData.get("creativeFormat") ?? "").trim() || null;
  const sourceType = String(formData.get("sourceType") ?? "").trim() || null;
  const aspectRatioCategory = String(formData.get("aspectRatioCategory") ?? "").trim() || null;
  const applicableTargetSizes = String(formData.get("applicableTargetSizesRaw") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const basePrompt = String(formData.get("basePrompt") ?? "").trim();
  const industryRules = String(formData.get("industryRules") ?? "").trim() || null;
  const layoutRules = String(formData.get("layoutRules") ?? "").trim() || null;
  const requiredElements = splitLines(formData.get("requiredElements"));
  const forbiddenChanges = splitLines(formData.get("forbiddenChanges"));
  const validationRules = splitLines(formData.get("validationRules"));

  if (!name) return { error: "Name is required." };
  if (!basePrompt) return { error: "Base prompt is required." };

  const { recipeId } = await createRecipe({
    name,
    industry,
    creativeFormat,
    sourceType,
    aspectRatioCategory,
    applicableTargetSizes,
    createdBy: "dev-designer",
    basePrompt,
    industryRules,
    layoutRules,
    requiredElements,
    forbiddenChanges,
    validationRules,
  });

  redirect(`/prompts/${recipeId}`);
}
