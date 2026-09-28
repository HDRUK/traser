import { cellStatus } from "./status";
import type { ColFilterMap, ResultsMap } from "./types";

export function rowPassesFilters(pid: string, columnFilters: ColFilterMap, results: ResultsMap): boolean {
  for (const [colKey, allowed] of Object.entries(columnFilters)) {
    if (allowed.size === 0) continue;
    if (!allowed.has(cellStatus(pid, colKey, results))) return false;
  }
  return true;
}
