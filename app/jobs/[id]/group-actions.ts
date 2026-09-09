"use server";

import { revalidatePath } from "next/cache";
import { createGroup, deleteGroup } from "@/lib/asset-groups";
import { requireSessionEmail } from "@/lib/require-session";

export async function createGroupAction(jobId: string, name: string, assetIds: string[]): Promise<void> {
  await requireSessionEmail();
  if (!name.trim() || assetIds.length === 0) return;
  await createGroup(jobId, name.trim(), assetIds);
  revalidatePath(`/jobs/${jobId}`);
}

export async function deleteGroupAction(jobId: string, groupId: string): Promise<void> {
  await requireSessionEmail();
  await deleteGroup(groupId);
  revalidatePath(`/jobs/${jobId}`);
}
