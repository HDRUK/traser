import type { ResultEntry, ResultsMap } from "./types";

// The results table only ever renders status + reason; translateBody/validateBody
// (~90% of the payload) are only needed in /playground, which recomputes them,
// so they're stripped before this reaches the client rather than sent and ignored.
export function stripHeavyResultBodies(results: ResultsMap): ResultsMap {
  const slim: ResultsMap = {};
  for (const [pid, cols] of Object.entries(results)) {
    const slimCols: Record<string, ResultEntry> = {};
    for (const [key, r] of Object.entries(cols)) {
      slimCols[key] = { translated: r.translated, valid: r.valid, reason: r.reason };
    }
    slim[pid] = slimCols;
  }
  return slim;
}
