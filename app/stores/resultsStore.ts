import { create } from "zustand";
import { persist } from "zustand/middleware";

type TabValue = "overview" | "live" | "draft" | "log";

interface ResultsPrefs {
  hiddenCols: string[];
  columnFilters: Record<string, string[]>;
  activeTab: TabValue;
  rowsPerPage: number;
}

interface ResultsStore extends ResultsPrefs {
  toggleHiddenCol: (col: string) => void;
  setColumnFilter: (col: string, statuses: string[]) => void;
  clearColumnFilter: (col: string) => void;
  clearAllColumnFilters: () => void;
  setActiveTab: (tab: TabValue) => void;
  setRowsPerPage: (n: number) => void;
}

export const resultsStore = create<ResultsStore>()(
  persist(
    (set, get) => ({
      hiddenCols: [],
      columnFilters: {},
      activeTab: "overview",
      rowsPerPage: 25,
      toggleHiddenCol: (col) => {
        const cols = get().hiddenCols;
        set({ hiddenCols: cols.includes(col) ? cols.filter((c) => c !== col) : [...cols, col] });
      },
      setColumnFilter: (col, statuses) =>
        set({ columnFilters: { ...get().columnFilters, [col]: statuses } }),
      clearColumnFilter: (col) => {
        const next = { ...get().columnFilters };
        delete next[col];
        set({ columnFilters: next });
      },
      clearAllColumnFilters: () => set({ columnFilters: {} }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setRowsPerPage: (n) => set({ rowsPerPage: n }),
    }),
    {
      name: "traser-results",
      skipHydration: true,
    }
  )
);
