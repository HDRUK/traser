import { CellStatus } from "./enums";
import { cellStatus } from "./status";
import type { Dataset, ResultsMap, SchemaStats } from "./types";

export function computeStats(colKey: string, datasets: Dataset[], results: ResultsMap): SchemaStats {
  let ok = 0, invalid = 0, failed = 0, pending = 0;
  for (const { pid } of datasets) {
    const s = cellStatus(pid, colKey, results);
    if (s === CellStatus.Ok) ok++;
    else if (s === CellStatus.Invalid) invalid++;
    else if (s === CellStatus.Failed) failed++;
    else pending++;
  }
  return { ok, invalid, failed, pending };
}
