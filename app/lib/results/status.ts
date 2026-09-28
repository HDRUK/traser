import { CellStatus } from "./enums";
import type { ResultsMap } from "./types";

export function cellStatus(pid: string, schemaKey: string, results: ResultsMap): CellStatus {
  const r = results[pid]?.[schemaKey];
  if (!r) return CellStatus.Pending;
  if (!r.translated) return CellStatus.Failed;
  if (!r.valid) return CellStatus.Invalid;
  return CellStatus.Ok;
}

export const STATUS_LABEL: Record<CellStatus, string> = {
  [CellStatus.Pending]: "Not yet tested",
  [CellStatus.Failed]: "Translation failed",
  [CellStatus.Invalid]: "Translated but validation failed",
  [CellStatus.Ok]: "Translation and validation passed",
};

export const STATUS_LEGEND_ORDER: CellStatus[] = [
  CellStatus.Ok,
  CellStatus.Invalid,
  CellStatus.Failed,
  CellStatus.Pending,
];

export const STATUS_FILTER_ORDER: CellStatus[] = [
  CellStatus.Failed,
  CellStatus.Invalid,
  CellStatus.Ok,
  CellStatus.Pending,
];
