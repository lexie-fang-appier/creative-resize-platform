import { NARAKA_TARGETS, type NarakaTargetId } from "./naraka-generation";

const OUTPUT_FILENAME = /^(?:[a-f0-9]{64}|fallback-[a-f0-9]{16})-([1-9]\d{1,3}x[1-9]\d{1,3})\.png$/;

export function workspaceOutputTarget(filename: string): NarakaTargetId | null {
  const match = OUTPUT_FILENAME.exec(filename);
  if (!match || !(match[1] in NARAKA_TARGETS)) return null;
  return match[1] as NarakaTargetId;
}

export function isSafeWorkspaceOutputFilename(filename: string): boolean {
  return workspaceOutputTarget(filename) !== null;
}
