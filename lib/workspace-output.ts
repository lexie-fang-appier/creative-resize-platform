/** Pattern check for a generated-output filename before it is served from disk.
 *
 * The shape alone is what makes this safe: a 64-char cache hash or a fallback
 * prefix, then WxH digits, then .png — nothing that can reach outside the
 * output directory. It used to also require the size to be a known target,
 * which added no safety and coupled a static-file route to the spec tables. */
const OUTPUT_FILENAME = /^(?:[a-f0-9]{64}|fallback-[a-f0-9]{16})-([1-9]\d{1,3}x[1-9]\d{1,3})\.png$/;

export function workspaceOutputTarget(filename: string): string | null {
  return OUTPUT_FILENAME.exec(filename)?.[1] ?? null;
}

export function isSafeWorkspaceOutputFilename(filename: string): boolean {
  return workspaceOutputTarget(filename) !== null;
}
