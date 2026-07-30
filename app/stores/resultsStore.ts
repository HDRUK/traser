import { create } from "zustand";
import { persist } from "zustand/middleware";

type TabValue = "overview" | "live" | "draft" | "log";

// Column filters are scoped per results view so filtering the Live tab does not
// silently also filter the Draft tab (they show different dataset sets).
// `hiddenCols` (driven by the shared header "Schemas" menu) and `rowsPerPage`
// stay global on purpose — those are page-wide preferences, not per-tab.
export type FilterView = "live" | "draft";

interface ResultsPrefs {
  hiddenCols: string[];
  columnFilters: Record<FilterView, Record<string, string[]>>;
  activeTab: TabValue;
  rowsPerPage: number;
}

interface ResultsStore extends ResultsPrefs {
  toggleHiddenCol: (col: string) => void;
  setColumnFilter: (view: FilterView, col: string, statuses: string[]) => void;
  clearColumnFilter: (view: FilterView, col: string) => void;
  clearAllColumnFilters: (view: FilterView) => void;
  setActiveTab: (tab: TabValue) => void;
  setRowsPerPage: (n: number) => void;
}

const emptyFilters = (): Record<FilterView, Record<string, string[]>> => ({ live: {}, draft: {} });

export const resultsStore = create<ResultsStore>()(
  persist(
    (set, get) => ({
      hiddenCols: [],
      columnFilters: emptyFilters(),
      activeTab: "overview",
      rowsPerPage: 25,
      toggleHiddenCol: (col) => {
        const cols = get().hiddenCols;
        set({ hiddenCols: cols.includes(col) ? cols.filter((c) => c !== col) : [...cols, col] });
      },
      setColumnFilter: (view, col, statuses) =>
        set({
          columnFilters: {
            ...get().columnFilters,
            [view]: { ...get().columnFilters[view], [col]: statuses },
          },
        }),
      clearColumnFilter: (view, col) => {
        const next = { ...get().columnFilters[view] };
        delete next[col];
        set({ columnFilters: { ...get().columnFilters, [view]: next } });
      },
      clearAllColumnFilters: (view) =>
        set({ columnFilters: { ...get().columnFilters, [view]: {} } }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setRowsPerPage: (n) => set({ rowsPerPage: n }),
    }),
    {
      name: "traser-results",
      skipHydration: true,
      version: 1,
      // v0 stored a flat `columnFilters: Record<col, string[]>`. The old shape
      // can't be attributed to a view, so reset it into the new per-view shape.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<ResultsPrefs>;
        if (version < 1) state.columnFilters = emptyFilters();
        return state as ResultsPrefs;
      },
    }
  )
);
