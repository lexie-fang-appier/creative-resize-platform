/** Tiny display-formatting helpers shared by the Phase 1 UI. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDimensions(width: number | null | undefined, height: number | null | undefined): string {
  if (width == null || height == null) return "—";
  return `${width}x${height}`;
}
