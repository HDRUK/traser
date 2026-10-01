import { useState } from "react";
import { useNavigate } from "react-router";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { Button } from "@hdruk/ui";
import type { RunComparison } from "~/lib/benchmark.server";
import type { BenchmarkRunSummary } from "~/lib/benchmarkStorage.server";
import { COMPARE_SELECT_MIN_WIDTH, COMPARE_STATS_MIN_WIDTH } from "~/lib/benchmark/constants";
import { ComparisonRow } from "./ComparisonRow";
import { StatsTable } from "./StatsTable";

interface CompareTabProps {
  index: BenchmarkRunSummary[];
  comparison: RunComparison | null;
  compareA: string | null;
  compareB: string | null;
  statsA: BenchmarkRunSummary["stats"];
  statsB: BenchmarkRunSummary["stats"];
  labelA: string | null;
  labelB: string | null;
}

export function CompareTab({ index, comparison, compareA, compareB, statsA, statsB, labelA, labelB }: CompareTabProps) {
  const navigate = useNavigate();
  const completed = index.filter((e) => !e.running);
  const [selA, setSelA] = useState(compareA ?? "");
  const [selB, setSelB] = useState(compareB ?? "");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end", mb: 2, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: COMPARE_SELECT_MIN_WIDTH }}>
          <InputLabel id="compareA-label">Run A</InputLabel>
          <Select labelId="compareA-label" label="Run A" value={selA} onChange={(e) => setSelA(e.target.value)}>
            {completed.map((r) => <MenuItem key={r.id} value={r.id}>{r.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: COMPARE_SELECT_MIN_WIDTH }}>
          <InputLabel id="compareB-label">Run B</InputLabel>
          <Select labelId="compareB-label" label="Run B" value={selB} onChange={(e) => setSelB(e.target.value)}>
            {completed.map((r) => <MenuItem key={r.id} value={r.id}>{r.label}</MenuItem>)}
          </Select>
        </FormControl>
        <Button
          disabled={!selA || !selB || selA === selB}
          onClick={() => navigate(`/benchmark?compareA=${encodeURIComponent(selA)}&compareB=${encodeURIComponent(selB)}`)}
        >
          Compare
        </Button>
      </Box>

      {!comparison && (
        <Typography color="text.secondary">Pick two completed runs to compare.</Typography>
      )}

      {comparison && (
        <>
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
            <Paper variant="outlined" sx={{ p: 1.5, minWidth: COMPARE_STATS_MIN_WIDTH }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{labelA}</Typography>
              <StatsTable stats={statsA} />
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.5, minWidth: COMPARE_STATS_MIN_WIDTH }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{labelB}</Typography>
              <StatsTable stats={statsB} />
            </Paper>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {comparison.common.length} common ids · {comparison.common.filter((c) => c.changed).length} changed
            {comparison.onlyInA.length > 0 && ` · ${comparison.onlyInA.length} only in ${labelA}`}
            {comparison.onlyInB.length > 0 && ` · ${comparison.onlyInB.length} only in ${labelB}`}
          </Typography>

          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell>ID</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Diffs</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {comparison.common.map((c) => (
                    <ComparisonRow
                      key={c.id}
                      comparison={c}
                      expanded={expanded.has(c.id)}
                      onToggle={toggleExpanded}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
}
