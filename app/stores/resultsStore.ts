import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CellStatus, FilterView, ResultsTab } from "~/lib/results/enums";

// Column filters are scoped per view so filtering Live doesn't also filter
// Draft (they show different dataset sets). hiddenCols/rowsPerPage stay
// global — page-wide preferences, not per-tab.
interface ResultsPrefs {
  hiddenCols: string[];
  columnFilters: Record<FilterView, Record<string, CellStatus[]>>;
  activeTab: ResultsTab;
  rowsPerPage: number;
}

interface ResultsStore extends ResultsPrefs {
  toggleHiddenCol: (col: string) => void;
  setColumnFilter: (view: FilterView, col: string, statuses: CellStatus[]) => void;
  clearColumnFilter: (view: FilterView, col: string) => void;
  clearAllColumnFilters: (view: FilterView) => void;
  setActiveTab: (tab: ResultsTab) => void;
  setRowsPerPage: (n: number) => void;
}

const emptyFilters = (): Record<FilterView, Record<string, CellStatus[]>> => ({
  [FilterView.Live]: {},
  [FilterView.Draft]: {},
});

export const resultsStore = create<ResultsStore>()(
  persist(
    (set, get) => ({
      hiddenCols: [],
      columnFilters: emptyFilters(),
      activeTab: ResultsTab.Overview,
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
      // v0 stored a flat columnFilters: Record<col, string[]> with no per-view
      // split — unattributable to a view, so reset rather than migrated.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<ResultsPrefs>;
        if (version < 1) state.columnFilters = emptyFilters();
        return state as ResultsPrefs;
      },
    }
  )
);
