import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { IconButton } from "@hdruk/ui";
import FilterListIcon from "@mui/icons-material/FilterList";
import SearchIcon from "@mui/icons-material/Search";
import {
  GROUP_HEADER_DIVIDER_COLOUR,
  GROUP_HEADER_ICON_DIM_COLOUR,
  ROWS_PER_PAGE_OPTIONS,
} from "~/lib/results/constants";
import { CellStatus } from "~/lib/results/enums";
import { rowPassesFilters } from "~/lib/results/filters";
import { SCHEMA_ACCENT_COLOUR, SCHEMA_GROUP_COLOURS, SCHEMA_GROUP_FALLBACK_COLOUR } from "~/lib/schemaGroupColours";
import type { ColFilterMap, Column, Dataset, ResultsMap } from "~/lib/results/types";
import { ColumnFilterPopover, type ColumnFilterAnchor } from "./ColumnFilterPopover";
import { DatasetRow } from "./DatasetRow";
import { StatusLegend } from "./StatusLegend";

interface ResultsTableViewProps {
  datasets: Dataset[];
  results: ResultsMap;
  visibleColumns: Column[];
  hiddenColCount: number;
  columnFilters: ColFilterMap;
  setColumnFilter: (col: string, statuses: CellStatus[]) => void;
  clearColumnFilter: (col: string) => void;
  clearAllColumnFilters: () => void;
  rowsPerPage: number;
  setRowsPerPage: (n: number) => void;
  emptyMessage?: string;
}

export function ResultsTableView({
  datasets, results, visibleColumns, hiddenColCount,
  columnFilters, setColumnFilter, clearColumnFilter, clearAllColumnFilters,
  rowsPerPage, setRowsPerPage,
  emptyMessage = "No datasets available.",
}: ResultsTableViewProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [filterAnchor, setFilterAnchor] = useState<ColumnFilterAnchor | null>(null);

  useEffect(() => { setPage(0); }, [searchTerm, columnFilters]);

  const referenceKey = visibleColumns.find((c) => c.isReference)?.key;

  const handleCellClick = useCallback(
    (pid: string, colKey: string) => {
      const params = new URLSearchParams({ pid, out: colKey });
      if (referenceKey) params.set("in", referenceKey);
      navigate(`/playground?${params}`);
    },
    [navigate, referenceKey]
  );

  if (datasets.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography color="text.secondary">{emptyMessage}</Typography>
      </Box>
    );
  }

  const hasActiveFilters = Object.values(columnFilters).some((s) => s.size > 0);
  const filtered = datasets
    .filter((d) => !searchTerm.trim() || d.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((d) => rowPassesFilters(d.pid, columnFilters, results));
  const pageRows = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      <StatusLegend />

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1, flexWrap: "wrap" }}>
        <TextField size="small" placeholder="Search datasets…" value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)} sx={{ width: 360 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </Box>

      {hasActiveFilters && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
          {Object.entries(columnFilters).filter(([, s]) => s.size > 0).map(([colKey, statuses]) => (
            <Chip key={colKey} size="small" label={`${colKey}: ${Array.from(statuses).join(", ")}`} onDelete={() => clearColumnFilter(colKey)} />
          ))}
          <Chip size="small" label="Clear all filters" variant="outlined" onClick={() => clearAllColumnFilters()} />
        </Box>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {filtered.length} of {datasets.length} datasets
        {hiddenColCount > 0 && ` · ${hiddenColCount} column${hiddenColCount > 1 ? "s" : ""} hidden`}
      </Typography>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ position: "sticky", left: 0, zIndex: 3, bgcolor: "background.paper", minWidth: 260, fontWeight: 700, py: 0.75 }}>
                  Dataset
                </TableCell>
                {visibleColumns.map(({ schema, version, key, isReference }, idx) => {
                  const filterActive = (columnFilters[key]?.size ?? 0) > 0;
                  const isGroupEnd = !isReference && idx < visibleColumns.length - 1 && visibleColumns[idx + 1].schema !== schema;
                  return (
                    <TableCell key={key} align="center"
                      sx={{
                        minWidth: 72, fontWeight: 600, fontSize: "0.68rem", lineHeight: 1.3,
                        color: "common.white", bgcolor: SCHEMA_GROUP_COLOURS[schema] ?? SCHEMA_GROUP_FALLBACK_COLOUR, zIndex: 2, py: 0.5,
                        ...(isReference && {
                          borderRight: `3px solid ${SCHEMA_ACCENT_COLOUR}`,
                          boxShadow: `inset 0 -3px 0 ${SCHEMA_ACCENT_COLOUR}`,
                        }),
                        ...(isGroupEnd && {
                          borderRight: `2px solid ${GROUP_HEADER_DIVIDER_COLOUR}`,
                        }),
                      }}>
                      {isReference && (
                        <Tooltip title="Every cached dataset is fetched from the Gateway API already translated into this schema — it's the canonical form every other column is translated from, not just this one dataset's native format">
                          <Typography component="div" sx={{ fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.9, color: SCHEMA_ACCENT_COLOUR, lineHeight: 1, mb: 0.25, cursor: "help" }}>
                            input
                          </Typography>
                        </Tooltip>
                      )}
                      {schema}<br />{version}
                      <Tooltip title={filterActive ? "Filter active — click to edit" : "Filter this column"}>
                        <IconButton size="small" onClick={(e) => setFilterAnchor({ el: e.currentTarget, colKey: key })}
                          aria-label={`Filter ${schema} ${version} column${filterActive ? " (filter active)" : ""}`}
                          sx={{ display: "block", mx: "auto", mt: 0.25, p: "1px", color: filterActive ? "warning.light" : GROUP_HEADER_ICON_DIM_COLOUR, "&:hover": { color: "common.white" } }}>
                          <FilterListIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map(({ pid, title, gatewayId, status: dStatus, gwdmVersion }: Dataset) => (
                <DatasetRow key={pid} pid={pid} title={title} gatewayId={gatewayId} datasetStatus={dStatus}
                  gwdmVersion={gwdmVersion}
                  columns={visibleColumns} results={results}
                  onCellClick={handleCellClick} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={filtered.length} page={page}
          onPageChange={(_, p) => setPage(p)} rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS} />
      </Paper>

      <ColumnFilterPopover
        anchor={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        activeStatuses={filterAnchor ? (columnFilters[filterAnchor.colKey] ?? new Set()) : new Set()}
        onChangeStatuses={setColumnFilter}
        onClearFilter={clearColumnFilter}
      />
    </Box>
  );
}
