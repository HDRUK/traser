import { useEffect, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import { IconButton } from "@hdruk/ui";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import type { BenchmarkRunSummary } from "~/lib/benchmarkStorage.server";
import { StatusChip } from "~/components/StatusChip";
import { BenchmarkIntent } from "~/lib/benchmark/enums";
import { formatMs } from "~/lib/benchmark/format";

interface HistoryRowProps {
  run: BenchmarkRunSummary;
  onDuplicate: (run: BenchmarkRunSummary) => void;
}

export function HistoryRow({ run, onDuplicate }: HistoryRowProps) {
  const fetcher = useFetcher<{ deleted?: boolean; error?: string }>();
  const { revalidate } = useRevalidator();
  const [deleted, setDeleted] = useState(false);

  // The loader list doesn't refresh on its own after the delete action, so drive
  // a revalidation once the delete resolves — this is what makes the row go away.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.deleted) {
      setDeleted(true);
      revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidate]);

  // Hide optimistically the instant the delete is in flight, and keep it hidden
  // once resolved so there's no flicker before revalidation unmounts the row.
  const deleting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === BenchmarkIntent.Delete;
  if (deleted || deleting) return null;

  return (
    <TableRow hover>
      <TableCell>{run.label}</TableCell>
      <TableCell sx={{ fontFamily: "monospace", fontSize: (theme) => theme.typography.caption.fontSize }}>{run.baseUrl}</TableCell>
      <TableCell>{run.schemaModel ? `${run.schemaModel} ${run.schemaVersion}` : "—"}</TableCell>
      <TableCell>{run.idRangeStart}–{run.idRangeEnd}</TableCell>
      <TableCell align="right">{run.repeat}</TableCell>
      <TableCell align="right">{run.concurrency}</TableCell>
      <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
      <TableCell>
        {run.running
          ? <StatusChip label="Running" tone="primary" />
          : <StatusChip label="Complete" tone="success" variant="outlined" icon={<CheckCircleIcon />} />}
      </TableCell>
      <TableCell align="right">{formatMs(run.stats?.median)}</TableCell>
      <TableCell align="right">{formatMs(run.stats?.p95)}</TableCell>
      <TableCell align="right">{run.stats ? `${Math.round(run.stats.successRate * 100)}%` : "—"}</TableCell>
      <TableCell align="right">
        <Tooltip title="Duplicate into a new run">
          <IconButton size="small" aria-label={`Duplicate run ${run.label}`} onClick={() => onDuplicate(run)}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <fetcher.Form method="post" style={{ display: "inline" }}>
          <input type="hidden" name="intent" value={BenchmarkIntent.Delete} />
          <input type="hidden" name="runId" value={run.id} />
          <Tooltip title={run.running ? "Cannot delete a running run" : "Delete run"}>
            <span>
              <IconButton
                type="submit"
                size="small"
                aria-label={`Delete run ${run.label}`}
                disabled={run.running || fetcher.state !== "idle"}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </fetcher.Form>
      </TableCell>
    </TableRow>
  );
}
