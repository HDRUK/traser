export enum CellStatus {
  Pending = "pending",
  Failed = "failed",
  Invalid = "invalid",
  Ok = "ok",
}

export enum ResultsTab {
  Overview = "overview",
  Live = "live",
  Draft = "draft",
  FetchFailures = "fetchFailures",
  Log = "log",
}

export enum ResultsIntent {
  Single = "single",
  Cancel = "cancel",
  Deep = "deep",
  All = "all",
}

export enum FilterView {
  Live = "live",
  Draft = "draft",
}

export enum DatasetStatus {
  Active = "ACTIVE",
  Draft = "DRAFT",
}
