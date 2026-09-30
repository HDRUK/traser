import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { BenchmarkRunSummary } from "~/lib/benchmarkStorage.server";
import { formatMs } from "~/lib/benchmark/format";

export function StatsTable({ stats }: { stats: BenchmarkRunSummary["stats"] }) {
  if (!stats) return <Typography variant="body2" color="text.secondary">No stats yet.</Typography>;

  const rows: Array<[string, string]> = [
    ["Requests", stats.count.toLocaleString()],
    ["Success rate", `${Math.round(stats.successRate * 100)}%`],
    ["Min", formatMs(stats.min)],
    ["Median", formatMs(stats.median)],
    ["Mean", formatMs(stats.mean)],
    ["p95", formatMs(stats.p95)],
    ["Max", formatMs(stats.max)],
  ];

  return (
    <Table size="small">
      <TableBody>
        {rows.map(([label, value]) => (
          <TableRow key={label}>
            <TableCell sx={{ color: "text.secondary", border: 0, py: 0.25 }}>{label}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, border: 0, py: 0.25 }}>{value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
