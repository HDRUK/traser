import { Fragment } from "react";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import { IconButton } from "@hdruk/ui";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { ComparisonIdResult } from "~/lib/benchmark.server";
import { StatusChip } from "~/components/StatusChip";
import { ComparisonDiffTable } from "./ComparisonDiffTable";

interface ComparisonRowProps {
  comparison: ComparisonIdResult;
  expanded: boolean;
  onToggle: (id: number) => void;
}

export function ComparisonRow({ comparison, expanded, onToggle }: ComparisonRowProps) {
  const expandable = comparison.diffs.length > 0;

  return (
    <Fragment>
      <TableRow
        hover
        sx={{ cursor: expandable ? "pointer" : "default" }}
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? expanded : undefined}
        onClick={() => expandable && onToggle(comparison.id)}
        onKeyDown={expandable ? (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(comparison.id);
          }
        } : undefined}
      >
        <TableCell sx={{ width: 32 }}>
          {expandable && (
            <IconButton
              size="small"
              tabIndex={-1}
              aria-label={expanded ? `Collapse diffs for id ${comparison.id}` : `Expand diffs for id ${comparison.id}`}
            >
              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
        <TableCell>{comparison.id}</TableCell>
        <TableCell>
          {comparison.changed
            ? <StatusChip label="Changed" tone="warning" variant="outlined" />
            : <StatusChip label="Identical" tone="success" variant="outlined" />}
        </TableCell>
        <TableCell align="right">{comparison.diffs.length}</TableCell>
      </TableRow>
      {expanded && expandable && (
        <TableRow>
          <TableCell colSpan={4} sx={{ bgcolor: "action.hover" }}>
            <ComparisonDiffTable diffs={comparison.diffs} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
