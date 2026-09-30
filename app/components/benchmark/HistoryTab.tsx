import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { BenchmarkRunSummary } from "~/lib/benchmarkStorage.server";
import { HistoryRow } from "./HistoryRow";

const COLUMNS: Array<{ label: string; align?: "right" }> = [
  { label: "Label" },
  { label: "Base URL" },
  { label: "Schema" },
  { label: "Range" },
  { label: "Repeat", align: "right" },
  { label: "Concurrency", align: "right" },
  { label: "Created" },
  { label: "Status" },
  { label: "Median", align: "right" },
  { label: "p95", align: "right" },
  { label: "Success", align: "right" },
  { label: "" },
];

interface HistoryTabProps {
  index: BenchmarkRunSummary[];
  onDuplicate: (run: BenchmarkRunSummary) => void;
}

export function HistoryTab({ index, onDuplicate }: HistoryTabProps) {
  if (index.length === 0) {
    return <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>No benchmark runs yet.</Typography>;
  }

  const newestFirst = [...index].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {COLUMNS.map((col, i) => (
                <TableCell key={col.label || `actions-${i}`} align={col.align}>{col.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {newestFirst.map((run) => (
              <HistoryRow key={run.id} run={run} onDuplicate={onDuplicate} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
