export function formatMs(ms: number | undefined): string {
  if (ms === undefined) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function formatDiffValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}
