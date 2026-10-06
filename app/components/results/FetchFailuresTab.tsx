import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { FetchFailure } from "~/lib/cache.server";
import { FetchFailureRow } from "./FetchFailureRow";

const COLUMN_COUNT = 9;

export function FetchFailuresTab({ failures }: { failures: FetchFailure[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (failures.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography color="text.secondary">
          No fetch failures — every dataset in the Gateway&apos;s list currently fetches OK from its individual endpoint.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {failures.length} dataset{failures.length > 1 ? "s" : ""} appear in the Gateway&apos;s dataset list but failed
        to fetch from their individual <code>/datasets/&#123;id&#125;</code> endpoint. They stay uncached and retry
        automatically the next time you click <strong>Sync New</strong>. Expand a row to see the Gateway&apos;s own
        error response.
      </Typography>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell sx={{ fontWeight: 700 }}>Gateway ID</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Error</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">HTTP Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Attempts</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>First failed</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last failed</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {failures.map((f) => (
                <FetchFailureRow
                  key={f.id}
                  failure={f}
                  expanded={expanded.has(f.id)}
                  onToggle={toggleExpanded}
                  columnCount={COLUMN_COUNT}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
