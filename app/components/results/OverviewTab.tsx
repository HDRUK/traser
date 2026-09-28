import { Pie, PieChart, Tooltip as RechartsTooltip } from "recharts";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import {
  DATASET_COUNT_ACCENT_COLOUR,
  PIE_TOOLTIP_BACKGROUND,
  PIE_TOOLTIP_BORDER,
} from "~/lib/results/constants";
import { CellStatus } from "~/lib/results/enums";
import { SCHEMA_GROUP_COLOURS, SCHEMA_GROUP_FALLBACK_COLOUR } from "~/lib/schemaGroupColours";
import { STATUS_LABEL, STATUS_LEGEND_ORDER } from "~/lib/results/status";
import { computeStats } from "~/lib/results/stats";
import { useStatusFillColour } from "~/lib/results/useStatusColours";
import type { Column, Dataset, ResultsMap } from "~/lib/results/types";

interface OverviewTabProps {
  columns: Column[];
  datasets: Dataset[];
  results: ResultsMap;
}

export function OverviewTab({ columns, datasets, results }: OverviewTabProps) {
  const theme = useTheme();
  const pieColours = useStatusFillColour();

  let totalTested = 0, totalOk = 0, totalInvalid = 0, totalFailed = 0;
  const totalCells = datasets.length * columns.length;
  for (const col of columns) {
    const s = computeStats(col.key, datasets, results);
    totalTested += s.ok + s.invalid + s.failed;
    totalOk += s.ok;
    totalInvalid += s.invalid;
    totalFailed += s.failed;
  }

  const summaryChips: Array<{ label: string; value: number; colour: string }> = [
    { label: "datasets", value: datasets.length, colour: DATASET_COUNT_ACCENT_COLOUR },
    { label: "cells tested", value: totalTested, colour: theme.palette.grey[500] },
    { label: "passed", value: totalOk, colour: pieColours[CellStatus.Ok] },
    { label: "invalid", value: totalInvalid, colour: pieColours[CellStatus.Invalid] },
    { label: "failed", value: totalFailed, colour: pieColours[CellStatus.Failed] },
    { label: "pending", value: totalCells - totalTested, colour: pieColours[CellStatus.Pending] },
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 3 }}>
        {summaryChips.map(({ label, value, colour }) => (
          <Paper key={label} variant="outlined" sx={{ px: 2, py: 1, textAlign: "center", minWidth: 90 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: colour, lineHeight: 1 }}>{value.toLocaleString()}</Typography>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 2 }}>
        {columns.map((col) => {
          const stats = computeStats(col.key, datasets, results);
          const pieData = [
            { name: "Passed", value: stats.ok, fill: pieColours[CellStatus.Ok] },
            { name: "Invalid", value: stats.invalid, fill: pieColours[CellStatus.Invalid] },
            { name: "Failed", value: stats.failed, fill: pieColours[CellStatus.Failed] },
            { name: "Pending", value: stats.pending, fill: pieColours[CellStatus.Pending] },
          ].filter((d) => d.value > 0);

          const tested = stats.ok + stats.invalid + stats.failed;
          const pct = datasets.length > 0 ? Math.round((stats.ok / datasets.length) * 100) : 0;

          return (
            <Paper key={col.key} variant="outlined" sx={{ p: 1.5, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5, width: "100%" }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: SCHEMA_GROUP_COLOURS[col.schema] ?? SCHEMA_GROUP_FALLBACK_COLOUR, flexShrink: 0 }} />
                <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {col.schema} {col.version}
                </Typography>
              </Box>

              <PieChart width={160} height={130}>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={55} innerRadius={28} dataKey="value" strokeWidth={0} />
                <RechartsTooltip
                  contentStyle={{ background: PIE_TOOLTIP_BACKGROUND, border: PIE_TOOLTIP_BORDER, borderRadius: 4, fontSize: 12 }}
                  formatter={(value: unknown, name: unknown) => {
                    const n = Number(value);
                    return [`${n} (${datasets.length > 0 ? Math.round(n / datasets.length * 100) : 0}%)`, String(name)];
                  }}
                />
              </PieChart>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center", mt: 0.5 }}>
                {STATUS_LEGEND_ORDER.map((s) => {
                  const n = stats[s];
                  if (n === 0) return null;
                  return (
                    <Tooltip key={s} title={STATUS_LABEL[s]}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                        <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: pieColours[s] }} />
                        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.65rem" }}>{n}</Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.65rem" }}>
                {tested}/{datasets.length} tested · {pct}% pass
              </Typography>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
