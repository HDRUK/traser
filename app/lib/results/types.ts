import type { CellStatus } from "./enums";

export interface ResultEntry {
  translated: boolean;
  valid: boolean;
  reason?: string;
  translateBody?: unknown;
  validateBody?: unknown;
}

export type ResultsMap = Record<string, Record<string, ResultEntry>>;

export type ColFilterMap = Record<string, Set<CellStatus>>;

export interface Dataset {
  pid: string;
  title: string;
  gatewayId?: string;
  status?: string;
  gwdmVersion?: string;
}

export interface Column {
  schema: string;
  version: string;
  key: string;
  isReference: boolean;
}

export interface SchemaStats {
  ok: number;
  invalid: number;
  failed: number;
  pending: number;
}
