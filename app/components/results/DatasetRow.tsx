import { memo } from "react";
import { useFetcher } from "react-router";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import LinkIconButton from "@mui/material/IconButton";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import { IconButton } from "@hdruk/ui";
import { gatewayDatasetUrl } from "~/lib/results/constants";
import { CellStatus, DatasetStatus, ResultsIntent } from "~/lib/results/enums";
import { SCHEMA_ACCENT_COLOUR } from "~/lib/schemaGroupColours";
import { cellStatus, STATUS_LABEL } from "~/lib/results/status";
import type { Column, ResultsMap } from "~/lib/results/types";
import { StatusIcon } from "./StatusIcon";

interface DatasetRowProps {
  pid: string;
  title: string;
  gatewayId?: string;
  datasetStatus?: string;
  columns: Column[];
  results: ResultsMap;
  onCellClick: (pid: string, colKey: string) => void;
}

export const DatasetRow = memo(function DatasetRow({
  pid, title, gatewayId, datasetStatus, columns, results, onCellClick,
}: DatasetRowProps) {
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  return (
    <TableRow hover>
      <TableCell sx={{ position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 1, maxWidth: 260, py: 0.25 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
          <Tooltip title={title} placement="right">
            <Typography variant="body2" sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title}
            </Typography>
          </Tooltip>
          {datasetStatus === DatasetStatus.Draft && (
            <Chip label="DRAFT" size="small" variant="outlined"
              sx={{ height: 16, fontSize: "0.6rem", fontWeight: 700, borderColor: "warning.main", color: "warning.main", flexShrink: 0, "& .MuiChip-label": { px: 0.5 } }} />
          )}
          {gatewayId && (
            <Tooltip title={`Open on Health Data Gateway (ID ${gatewayId})`}>
              <LinkIconButton component="a" href={gatewayDatasetUrl(gatewayId)}
                target="_blank" rel="noopener noreferrer" size="small"
                aria-label={`Open dataset ${gatewayId} on the Health Data Gateway`}
                sx={{ p: "2px", flexShrink: 0, color: "text.disabled", "&:hover": { color: "primary.light" } }}>
                <OpenInNewIcon sx={{ fontSize: 12 }} />
              </LinkIconButton>
            </Tooltip>
          )}
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value={ResultsIntent.Single} />
            <input type="hidden" name="pid" value={pid} />
            <Tooltip title="Test this dataset">
              <span>
                <IconButton type="submit" size="small" disabled={isLoading} aria-label={`Test dataset ${title}`} sx={{ p: "2px", flexShrink: 0 }}>
                  {isLoading ? <CircularProgress size={12} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                </IconButton>
              </span>
            </Tooltip>
          </fetcher.Form>
        </Box>
      </TableCell>

      {columns.map(({ key, schema, isReference }, idx) => {
        const status = cellStatus(pid, key, results);
        const r = results[pid]?.[key];
        const tooltipLabel =
          (status === CellStatus.Failed || status === CellStatus.Invalid) && r?.reason
            ? r.reason
            : STATUS_LABEL[status];
        const isGroupEnd = !isReference && idx < columns.length - 1 && columns[idx + 1].schema !== schema;
        return (
          <TableCell key={key} align="center" padding="none"
            role={!isLoading ? "button" : undefined}
            tabIndex={!isLoading ? 0 : undefined}
            aria-label={`${schema} ${key.split(":")[1] ?? ""} — ${tooltipLabel} — open in Playground`}
            sx={{
              py: 0.25,
              cursor: isLoading ? "default" : "pointer",
              "&:hover": !isLoading ? { bgcolor: "action.hover" } : undefined,
              "&:focus-visible": !isLoading ? { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" } : undefined,
              ...(isReference && { borderRight: `3px solid ${SCHEMA_ACCENT_COLOUR}` }),
              ...(isGroupEnd && { borderRight: "2px solid", borderRightColor: "divider" }),
            }}
            onClick={!isLoading ? () => onCellClick(pid, key) : undefined}
            onKeyDown={!isLoading ? (e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCellClick(pid, key); }
            } : undefined}>
            {isLoading ? <CircularProgress size={14} /> : (
              <Tooltip title={`${tooltipLabel} — open in Playground`}>
                <span><StatusIcon status={status} /></span>
              </Tooltip>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
});
