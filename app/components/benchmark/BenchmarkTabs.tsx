import type { ReactNode } from "react";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import type { BenchmarkTab } from "~/lib/benchmark/enums";

export interface BenchmarkTabDef {
  value: BenchmarkTab;
  label: string;
  content: ReactNode;
}

interface BenchmarkTabsProps {
  tabs: BenchmarkTabDef[];
  activeTab: BenchmarkTab;
  onChange: (tab: BenchmarkTab) => void;
}

export function BenchmarkTabs({ tabs, activeTab, onChange }: BenchmarkTabsProps) {
  const active = tabs.find((t) => t.value === activeTab);

  return (
    <>
      <Tabs value={activeTab} onChange={(_, v: BenchmarkTab) => onChange(v)} sx={{
        mb: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
        "& .MuiTab-root": { textTransform: "none", fontWeight: 500 },
        "& .Mui-selected": { fontWeight: 700 },
      }}>
        {tabs.map((t) => <Tab key={t.value} value={t.value} label={t.label} />)}
      </Tabs>
      {active?.content}
    </>
  );
}
