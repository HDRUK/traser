import { Fragment } from "react";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import LinkIconButton from "@mui/material/IconButton";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { IconButton } from "@hdruk/ui";
import { gatewayDatasetUrl } from "~/lib/results/constants";
import { JsonViewer } from "~/components/JsonViewer";
import type { FetchFailure } from "~/lib/cache.server";

interface FetchFailureRowProps {
  failure: FetchFailure;
  expanded: boolean;
  onToggle: (id: string) => void;
  columnCount: number;
}

export function FetchFailureRow({ failure, expanded, onToggle, columnCount }: FetchFailureRowProps) {
  const expandable = Boolean(failure.details);

  return (
    <Fragment>
      <TableRow
        hover
        sx={{ cursor: expandable ? "pointer" : "default" }}
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? expanded : undefined}
        onClick={() => expandable && onToggle(failure.id)}
        onKeyDown={expandable ? (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(failure.id);
          }
        } : undefined}
      >
        <TableCell sx={{ width: 32 }}>
          {expandable && (
            <IconButton
              size="small"
              tabIndex={-1}
              aria-label={expanded ? `Hide error response for dataset ${failure.id}` : `Show error response for dataset ${failure.id}`}
            >
              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
        <TableCell>{failure.id}</TableCell>
        <TableCell>
          <Typography variant="body2" color={failure.title ? "text.primary" : "text.disabled"}
            sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {failure.title ?? "—"}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" color="error.main">{failure.error}</Typography>
        </TableCell>
        <TableCell align="center">{failure.status ?? "—"}</TableCell>
        <TableCell align="center">{failure.attempts}</TableCell>
        <TableCell>{new Date(failure.firstFailedAt).toLocaleString()}</TableCell>
        <TableCell>{new Date(failure.lastFailedAt).toLocaleString()}</TableCell>
        <TableCell align="center">
          <Tooltip title={`Open dataset ${failure.id} on the Health Data Gateway`}>
            <LinkIconButton component="a" href={gatewayDatasetUrl(failure.id)}
              target="_blank" rel="noopener noreferrer" size="small"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Open dataset ${failure.id} on the Health Data Gateway`}>
              <OpenInNewIcon sx={{ fontSize: 14 }} />
            </LinkIconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
      {expanded && expandable && (
        <TableRow>
          <TableCell colSpan={columnCount} sx={{ bgcolor: "action.hover", p: 1.5 }}>
            <JsonViewer value={failure.details!} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
