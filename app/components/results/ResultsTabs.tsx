import type { ReactElement, ReactNode } from "react";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import type { ResultsTab } from "~/lib/results/enums";

export interface ResultsTabDef {
  value: ResultsTab;
  label: string;
  icon?: ReactElement;
  content: ReactNode;
}

interface ResultsTabsProps {
  tabs: ResultsTabDef[];
  activeTab: ResultsTab;
  onChange: (tab: ResultsTab) => void;
}

export function ResultsTabs({ tabs, activeTab, onChange }: ResultsTabsProps) {
  const active = tabs.find((t) => t.value === activeTab);

  return (
    <>
      <Tabs value={activeTab} onChange={(_, v: ResultsTab) => onChange(v)} sx={{
        mb: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
        "& .MuiTab-root": { textTransform: "none", fontWeight: 500 },
        "& .Mui-selected": { fontWeight: 700 },
      }}>
        {tabs.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} icon={t.icon} iconPosition={t.icon ? "start" : undefined} />
        ))}
      </Tabs>
      {active?.content}
    </>
  );
}
