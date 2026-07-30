import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resultsStore, type FilterView } from "../stores/resultsStore";
import { useFetcher, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { Pie, PieChart, Tooltip as RechartsTooltip } from "recharts";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Popover from "@mui/material/Popover";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FilterListIcon from "@mui/icons-material/FilterList";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import WarningIcon from "@mui/icons-material/Warning";

import { getDatasetIndex, readTestResults, writeTestResults, clearAllDatasetFiles } from "~/lib/cache.server";
import { listSchemas } from "~/lib/traser.server";
import { runAllTests, runSingleDataset, isRefreshRunning } from "~/lib/refresh.server";
import { requireAdmin } from "~/lib/auth.server";

import type { Route } from "./+types/results";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

// ─── Loader ───────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const _user = requireAdmin(request);
  const [datasets, schemas, cache] = await Promise.all([
    getDatasetIndex(),
    listSchemas(),
    readTestResults(),
  ]);

  if (cache.running && !isRefreshRunning()) {
    cache.running = false;
    cache.log = [
      ...(cache.log ?? []),
      `[${new Date().toTimeString().slice(0, 8)}] Detected stale running flag — reset (server restart or crash)`,
    ];
    await writeTestResults(cache);
  }

  // Strip the heavy translateBody/validateBody from each cell before sending to
  // the client. The results table only renders status + reason; the full bodies
  // (~90% of the payload) are only needed in /playground, which recomputes them.
  const slimResults: ResultsMap = {};
  for (const [pid, cols] of Object.entries(cache.results ?? {})) {
    const slimCols: Record<string, ResultEntry> = {};
    for (const [key, r] of Object.entries(cols)) {
      slimCols[key] = { translated: r.translated, valid: r.valid, reason: r.reason };
    }
    slimResults[pid] = slimCols;
  }

  return {
    datasets,
    schemas,
    results: slimResults,
    lastUpdated: cache.lastUpdated ?? null,
    running: cache.running ?? false,
    progress: cache.progress ?? null,
    log: cache.log ?? [],
  };
}

// ─── Action ───────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "single") {
    const pid = formData.get("pid");
    if (typeof pid === "string" && pid) await runSingleDataset(pid);
    return { done: true };
  }

  if (intent === "deep") {
    await clearAllDatasetFiles();
    const cache = await readTestResults();
    cache.running = true;
    cache.results = {};
    cache.log = [];
    cache.progress = { completed: 0, total: 0 };
    await writeTestResults(cache);
    runAllTests().catch((err) => console.error("runAllTests deep error:", err));
    return { started: true };
  }

  const cache = await readTestResults();
  cache.running = true;
  cache.results ??= {};
  await writeTestResults(cache);

  runAllTests().catch((err) => console.error("runAllTests error:", err));
  return { started: true };
}

export function meta() {
  return [{ title: "Schema Test Results — TRASER" }];
}

// ─── Types ────────────────────────────────────────────────────────────────

interface ResultEntry {
  translated: boolean;
  valid: boolean;
  reason?: string;
  translateBody?: unknown;
  validateBody?: unknown;
}

type ResultsMap = Record<string, Record<string, ResultEntry>>;
type ColFilterMap = Record<string, Set<CellStatus>>;

// Canonical dataset shape from the loader's dataset index, reused everywhere a
// row/list of datasets is rendered (avoids re-declaring the literal per prop).
interface Dataset {
  pid: string;
  title: string;
  gatewayId?: string;
  status?: string;
}

// ─── Schema group colours ──────────────────────────────────────────────────

const GROUP_COLOURS: Record<string, string> = {
  HDRUK: "#1565C0",
  GWDM: "#2E7D32",
  SchemaOrg: "#6A1B9A",
};

// ─── Column ordering ──────────────────────────────────────────────────────

interface Column {
  schema: string;
  version: string;
  key: string;
  isReference: boolean;
}

function buildColumns(schemas: Record<string, string[]>, showInputMarker: boolean): Column[] {
  const cols: Column[] = [];
  const added = new Set<string>();

  const push = (schema: string, version: string) => {
    const key = `${schema}:${version}`;
    if (added.has(key)) return;
    cols.push({ schema, version, key, isReference: showInputMarker && key === "GWDM:2.0" });
    added.add(key);
  };

  // GWDM group first: 2.0 (reference/input), then remaining GWDM newest→oldest
  if (schemas["GWDM"]?.includes("2.0")) push("GWDM", "2.0");
  for (const v of [...(schemas["GWDM"] ?? [])].reverse()) push("GWDM", v);

  // HDRUK newest→oldest, then SchemaOrg
  for (const v of [...(schemas["HDRUK"] ?? [])].reverse()) push("HDRUK", v);
  for (const v of schemas["SchemaOrg"] ?? []) push("SchemaOrg", v);

  // Everything else (CRUK, any future schemas)
  for (const [schema, versions] of Object.entries(schemas))
    for (const version of versions) push(schema, version);

  return cols;
}

// ─── Status helpers ───────────────────────────────────────────────────────

type CellStatus = "pending" | "failed" | "invalid" | "ok";

function cellStatus(pid: string, schemaKey: string, results: ResultsMap): CellStatus {
  const r = results[pid]?.[schemaKey];
  if (!r) return "pending";
  if (!r.translated) return "failed";
  if (!r.valid) return "invalid";
  return "ok";
}

const STATUS_ICON: Record<CellStatus, React.ReactElement> = {
  pending: <HourglassEmptyIcon sx={{ color: "text.disabled", fontSize: 20 }} />,
  failed:  <CancelIcon sx={{ color: "error.main", fontSize: 20 }} />,
  invalid: <WarningIcon sx={{ color: "warning.main", fontSize: 20 }} />,
  ok:      <CheckCircleIcon sx={{ color: "success.main", fontSize: 20 }} />,
};

// Explicit hex colours for Chip icons (MUI Chip overrides the icon's own sx colour)
const STATUS_ICON_COLOUR: Record<CellStatus, string> = {
  ok:      "#4caf50",
  invalid: "#ff9800",
  failed:  "#f44336",
  pending: "#9e9e9e",
};

const STATUS_LABEL: Record<CellStatus, string> = {
  pending: "Not yet tested",
  failed:  "Translation failed",
  invalid: "Translated but validation failed",
  ok:      "Translation and validation passed",
};

// ─── Filter helpers ───────────────────────────────────────────────────────

function rowPassesFilters(pid: string, columnFilters: ColFilterMap, results: ResultsMap): boolean {
  for (const [colKey, allowed] of Object.entries(columnFilters)) {
    if (allowed.size === 0) continue;
    if (!allowed.has(cellStatus(pid, colKey, results))) return false;
  }
  return true;
}

// ─── Dataset row ──────────────────────────────────────────────────────────

interface RowProps {
  pid: string;
  title: string;
  gatewayId?: string;
  datasetStatus?: string;
  columns: Column[];
  results: ResultsMap;
  onCellClick: (pid: string, colKey: string) => void;
}

const DatasetRow = memo(function DatasetRow({ pid, title, gatewayId, datasetStatus, columns, results, onCellClick }: RowProps) {
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
          {datasetStatus === "DRAFT" && (
            <Chip label="DRAFT" size="small" variant="outlined"
              sx={{ height: 16, fontSize: "0.6rem", fontWeight: 700, borderColor: "warning.main", color: "warning.light", flexShrink: 0, "& .MuiChip-label": { px: 0.5 } }} />
          )}
          {gatewayId && (
            <Tooltip title={`Open on Health Data Gateway (ID ${gatewayId})`}>
              <IconButton component="a" href={`https://healthdatagateway.org/en/dataset/${gatewayId}`}
                target="_blank" rel="noopener noreferrer" size="small"
                aria-label={`Open dataset ${gatewayId} on the Health Data Gateway`}
                sx={{ p: "2px", flexShrink: 0, color: "text.disabled", "&:hover": { color: "primary.light" } }}>
                <OpenInNewIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          )}
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="single" />
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
        const tooltipLabel = (status === "failed" || status === "invalid") && r?.reason ? r.reason : STATUS_LABEL[status];
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
              ...(isReference && { borderRight: "3px solid #FFD54F" }),
              ...(isGroupEnd && { borderRight: "2px solid rgba(255,255,255,0.1)" }),
            }}
            onClick={!isLoading ? () => onCellClick(pid, key) : undefined}
            onKeyDown={!isLoading ? (e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCellClick(pid, key); }
            } : undefined}>
            {isLoading ? <CircularProgress size={14} /> : (
              <Tooltip title={`${tooltipLabel} — open in Playground`}>
                <span>{STATUS_ICON[status]}</span>
              </Tooltip>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
});

// ─── Overview tab — per-schema pie charts ─────────────────────────────────

const PIE_COLOURS: Record<CellStatus, string> = {
  ok:      "#4caf50",
  invalid: "#ff9800",
  failed:  "#f44336",
  pending: "#616161",
};

interface SchemaStats { ok: number; invalid: number; failed: number; pending: number }

function computeStats(colKey: string, datasets: Dataset[], results: ResultsMap): SchemaStats {
  let ok = 0, invalid = 0, failed = 0, pending = 0;
  for (const { pid } of datasets) {
    const s = cellStatus(pid, colKey, results);
    if (s === "ok") ok++;
    else if (s === "invalid") invalid++;
    else if (s === "failed") failed++;
    else pending++;
  }
  return { ok, invalid, failed, pending };
}

function OverviewTab({ columns, datasets, results }: {
  columns: Column[];
  datasets: Dataset[];
  results: ResultsMap;
}) {
  // Totals across all cells
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
    { label: "datasets", value: datasets.length, colour: "#90caf9" },
    { label: "cells tested", value: totalTested, colour: "#9e9e9e" },
    { label: "passed", value: totalOk, colour: PIE_COLOURS.ok },
    { label: "invalid", value: totalInvalid, colour: PIE_COLOURS.invalid },
    { label: "failed", value: totalFailed, colour: PIE_COLOURS.failed },
    { label: "pending", value: totalCells - totalTested, colour: PIE_COLOURS.pending },
  ];

  return (
    <Box>
      {/* Summary row */}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 3 }}>
        {summaryChips.map(({ label, value, colour }) => (
          <Paper key={label} variant="outlined" sx={{ px: 2, py: 1, textAlign: "center", minWidth: 90 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: colour, lineHeight: 1 }}>{value.toLocaleString()}</Typography>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Pie chart grid */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 2 }}>
        {columns.map((col) => {
          const stats = computeStats(col.key, datasets, results);
          const allPieData: Array<{ name: string; value: number; status: CellStatus; fill: string }> = [
            { name: "Passed",  value: stats.ok,      status: "ok",      fill: PIE_COLOURS.ok },
            { name: "Invalid", value: stats.invalid,  status: "invalid", fill: PIE_COLOURS.invalid },
            { name: "Failed",  value: stats.failed,   status: "failed",  fill: PIE_COLOURS.failed },
            { name: "Pending", value: stats.pending,  status: "pending", fill: PIE_COLOURS.pending },
          ];
          const pieData = allPieData.filter(d => d.value > 0);

          const tested = stats.ok + stats.invalid + stats.failed;
          const pct = datasets.length > 0 ? Math.round((stats.ok / datasets.length) * 100) : 0;

          return (
            <Paper key={col.key} variant="outlined" sx={{ p: 1.5, display: "flex", flexDirection: "column", alignItems: "center" }}>
              {/* Header */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5, width: "100%" }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: GROUP_COLOURS[col.schema] ?? "grey.700", flexShrink: 0 }} />
                <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {col.schema} {col.version}
                </Typography>
              </Box>

              {/* Pie */}
              <PieChart width={160} height={130}>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={55} innerRadius={28} dataKey="value" strokeWidth={0} />
                <RechartsTooltip
                  contentStyle={{ background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, fontSize: 12 }}
                  formatter={(value: unknown, name: unknown) => {
                    const n = Number(value);
                    return [`${n} (${datasets.length > 0 ? Math.round(n / datasets.length * 100) : 0}%)`, String(name)];
                  }}
                />
              </PieChart>

              {/* Legend counts */}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center", mt: 0.5 }}>
                {(["ok", "invalid", "failed", "pending"] as CellStatus[]).map((s) => {
                  const n = stats[s];
                  if (n === 0) return null;
                  return (
                    <Tooltip key={s} title={STATUS_LABEL[s]}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                        <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: PIE_COLOURS[s] }} />
                        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.65rem" }}>{n}</Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>

              {/* % pass */}
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

// ─── Log tab ──────────────────────────────────────────────────────────────

function LogTab({ log, running }: { log: string[]; running: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  if (!running && log.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography color="text.secondary">No log entries yet — run a refresh to see activity.</Typography>
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: "#0d1117" }}>
      {running && (
        <Box sx={{ px: 1.5, py: 0.5, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <Typography variant="caption" sx={{ color: "#58a6ff", fontFamily: "monospace" }}>● Running…</Typography>
        </Box>
      )}
      <Box sx={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto", px: 1.5, py: 1, fontFamily: "monospace", fontSize: "0.72rem", color: "#c9d1d9", lineHeight: 1.6 }}>
        {log.map((line, i) => <div key={i}>{line}</div>)}
        <div ref={bottomRef} />
      </Box>
    </Paper>
  );
}

// ─── Results table view (used by Live and Draft tabs) ─────────────────────

interface ResultsTableViewProps {
  datasets: Dataset[];
  results: ResultsMap;
  visibleColumns: Column[];
  hiddenColCount: number;
  columnFilters: ColFilterMap;
  setColumnFilter: (col: string, statuses: string[]) => void;
  clearColumnFilter: (col: string) => void;
  clearAllColumnFilters: () => void;
  rowsPerPage: number;
  setRowsPerPage: (n: number) => void;
  emptyMessage?: string;
}

function ResultsTableView({
  datasets, results, visibleColumns, hiddenColCount,
  columnFilters, setColumnFilter, clearColumnFilter, clearAllColumnFilters,
  rowsPerPage, setRowsPerPage,
  emptyMessage = "No datasets available.",
}: ResultsTableViewProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [filterAnchor, setFilterAnchor] = useState<{ el: HTMLElement; colKey: string } | null>(null);

  useEffect(() => { setPage(0); }, [searchTerm, columnFilters]);

  // Stable reference so the memoized DatasetRow only re-renders when its own data changes.
  const handleCellClick = useCallback(
    (pid: string, colKey: string) =>
      navigate(`/playground?pid=${encodeURIComponent(pid)}&in=GWDM:2.0&out=${encodeURIComponent(colKey)}`),
    [navigate]
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
      {/* Legend */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        {(["ok", "invalid", "failed", "pending"] as CellStatus[]).map((s) => (
          <Chip key={s} icon={STATUS_ICON[s]} label={STATUS_LABEL[s]} size="small" variant="outlined"
            sx={{ "& .MuiChip-icon": { ml: "6px", color: STATUS_ICON_COLOUR[s] } }} />
        ))}
      </Box>

      {/* Search */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1, flexWrap: "wrap" }}>
        <TextField size="small" placeholder="Search datasets…" value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)} sx={{ width: 360 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </Box>

      {/* Active filter chips */}
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
                        color: "#fff", bgcolor: GROUP_COLOURS[schema] ?? "grey.700", zIndex: 2, py: 0.5,
                        ...(isReference && {
                          borderRight: "3px solid #FFD54F",
                          boxShadow: "inset 0 -3px 0 #FFD54F",
                        }),
                        ...(isGroupEnd && {
                          borderRight: "2px solid rgba(255,255,255,0.25)",
                        }),
                      }}>
                      {isReference && (
                        <Typography component="div" sx={{ fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.9, color: "#FFD54F", lineHeight: 1, mb: 0.25 }}>
                          input
                        </Typography>
                      )}
                      {schema}<br />{version}
                      <Tooltip title={filterActive ? "Filter active — click to edit" : "Filter this column"}>
                        <IconButton size="small" onClick={(e) => setFilterAnchor({ el: e.currentTarget, colKey: key })}
                          aria-label={`Filter ${schema} ${version} column${filterActive ? " (filter active)" : ""}`}
                          sx={{ display: "block", mx: "auto", mt: 0.25, p: "1px", color: filterActive ? "warning.light" : "rgba(255,255,255,0.4)", "&:hover": { color: "#fff" } }}>
                          <FilterListIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map(({ pid, title, gatewayId, status: dStatus }: Dataset) => (
                <DatasetRow key={pid} pid={pid} title={title} gatewayId={gatewayId} datasetStatus={dStatus}
                  columns={visibleColumns} results={results}
                  onCellClick={handleCellClick} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={filtered.length} page={page}
          onPageChange={(_, p) => setPage(p)} rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]} />
      </Paper>

      {/* Column filter popover */}
      <Popover open={!!filterAnchor} anchorEl={filterAnchor?.el} onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }} transformOrigin={{ vertical: "top", horizontal: "center" }}>
        {filterAnchor && (
          <Box sx={{ p: 1.5, minWidth: 210 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Filter: <strong>{filterAnchor.colKey}</strong>
            </Typography>
            <ToggleButtonGroup
              value={Array.from(columnFilters[filterAnchor.colKey] ?? [])}
              onChange={(_, newValues: string[]) => {
                const colKey = filterAnchor.colKey;
                if (newValues.length === 0) clearColumnFilter(colKey);
                else setColumnFilter(colKey, newValues);
              }}
              size="small" orientation="vertical" sx={{ width: "100%" }}>
              {(["failed", "invalid", "ok", "pending"] as CellStatus[]).map((s) => (
                <ToggleButton key={s} value={s} sx={{ justifyContent: "flex-start", gap: 1, py: 0.5, textTransform: "none" }}>
                  {STATUS_ICON[s]}
                  <Typography variant="caption">{STATUS_LABEL[s]}</Typography>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {(columnFilters[filterAnchor.colKey]?.size ?? 0) > 0 && (
              <Button size="small" fullWidth sx={{ mt: 1 }} onClick={() => { clearColumnFilter(filterAnchor.colKey); setFilterAnchor(null); }}>
                Clear filter
              </Button>
            )}
          </Box>
        )}
      </Popover>

    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

type TabValue = "overview" | "live" | "draft" | "log";

export default function ResultsPage() {
  const { datasets, schemas, results, lastUpdated, running, progress, log } =
    useLoaderData<typeof loader>();

  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();

  // ── Persisted UI preferences
  const {
    hiddenCols: hiddenColsArr, columnFilters: columnFiltersArr,
    activeTab, rowsPerPage,
    toggleHiddenCol, setColumnFilter, clearColumnFilter, clearAllColumnFilters,
    setActiveTab, setRowsPerPage,
  } = resultsStore();

  useEffect(() => { resultsStore.persist.rehydrate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive Sets for existing component logic
  const hiddenCols = useMemo(() => new Set(hiddenColsArr), [hiddenColsArr]);
  // Column filters are stored per view (live/draft) so the two tabs filter
  // independently. Build a Set-based map for each view.
  const columnFiltersByView = useMemo(() => {
    const build = (view: FilterView): ColFilterMap =>
      Object.fromEntries(
        Object.entries(columnFiltersArr[view] ?? {}).map(([k, v]) => [k, new Set(v as CellStatus[])])
      ) as ColFilterMap;
    return { live: build("live"), draft: build("draft") };
  }, [columnFiltersArr]);

  // ── Transient UI state
  const [colMenuAnchor, setColMenuAnchor] = useState<HTMLElement | null>(null);

  // Auto-revalidate every 5 s while running
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => revalidate(), 5_000);
    return () => clearTimeout(timer);
  }, [running, revalidate, progress]);

  // Handle stale persisted tab value (e.g. "table" from old store schema)
  const VALID_TABS: TabValue[] = ["overview", "live", "draft", "log"];
  const resolvedTab: TabValue = VALID_TABS.includes(activeTab as TabValue) ? activeTab as TabValue : "overview";

  const liveColumns = useMemo(() => buildColumns(schemas, true), [schemas]);
  const draftColumns = useMemo(() => buildColumns(schemas, false), [schemas]);
  const visibleLiveColumns = useMemo(
    () => liveColumns.filter((c) => !hiddenCols.has(c.key)),
    [liveColumns, hiddenCols]
  );
  const visibleDraftColumns = useMemo(
    () => draftColumns.filter((c) => !hiddenCols.has(c.key)),
    [draftColumns, hiddenCols]
  );

  const liveDatasets = useMemo(() => datasets.filter((d: Dataset) => d.status !== "DRAFT"), [datasets]);
  const draftDatasets = useMemo(() => datasets.filter((d: Dataset) => d.status === "DRAFT"), [datasets]);
  const draftCount = draftDatasets.length;

  const isRefreshAllBusy = running || fetcher.state !== "idle";
  const progressPct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;

  const sharedTableProps = {
    results,
    hiddenColCount: hiddenCols.size,
    rowsPerPage,
    setRowsPerPage,
  };

  // Per-view filter props: bind the store setters to the tab's view so each tab
  // owns its own column filters.
  const filterProps = (view: FilterView) => ({
    columnFilters: columnFiltersByView[view],
    setColumnFilter: (col: string, statuses: string[]) => setColumnFilter(view, col, statuses),
    clearColumnFilter: (col: string) => clearColumnFilter(view, col),
    clearAllColumnFilters: () => clearAllColumnFilters(view),
  });

  return (
    <Box sx={{ p: 3 }}>
      {/* ── Header (always visible) */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Schema Test Results</Typography>

        {lastUpdated && !running && (
          <Typography variant="caption" color="text.secondary">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </Typography>
        )}

        {running && progress && (
          <Typography variant="caption" color="text.secondary">
            {progress.completed} / {progress.total} ({progressPct}%)
          </Typography>
        )}

        <Button size="small" variant="contained" color="inherit" startIcon={<ViewColumnIcon />}
          onClick={(e) => setColMenuAnchor(e.currentTarget)}
          sx={{ bgcolor: "action.selected", "&:hover": { bgcolor: "action.focus" } }}>
          Schemas
        </Button>
        <Menu anchorEl={colMenuAnchor} open={!!colMenuAnchor} onClose={() => setColMenuAnchor(null)}
          slotProps={{ paper: { sx: { maxHeight: 400 } } }}>
          {liveColumns.map(({ key, schema, version }) => (
            <MenuItem key={key} dense onClick={() => toggleHiddenCol(key)}>
              <Checkbox size="small" checked={!hiddenCols.has(key)} disableRipple sx={{ p: 0, mr: 1 }} />
              <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: GROUP_COLOURS[schema] ?? "grey.700", mr: 1, flexShrink: 0 }} />
              <ListItemText primary={`${schema} ${version}`} />
            </MenuItem>
          ))}
        </Menu>

        <Box sx={{ display: "flex", gap: 1 }}>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="all" />
            <Tooltip title="Fetch new datasets from the API and test any uncached schema combinations">
              <span>
                <Button type="submit" variant="contained"
                  startIcon={isRefreshAllBusy ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                  disabled={isRefreshAllBusy} size="small">
                  Sync New
                </Button>
              </span>
            </Tooltip>
          </fetcher.Form>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="deep" />
            <Tooltip title="Clear all cached datasets and test results, then re-download and re-test everything from scratch">
              <span>
                <Button type="submit" variant="outlined" color="warning"
                  startIcon={isRefreshAllBusy ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                  disabled={isRefreshAllBusy} size="small">
                  Deep Refresh
                </Button>
              </span>
            </Tooltip>
          </fetcher.Form>
        </Box>
      </Box>

      {running && (
        <LinearProgress variant={progressPct !== null ? "determinate" : "indeterminate"}
          value={progressPct ?? undefined} sx={{ mb: 1.5, borderRadius: 1 }} />
      )}

      {/* ── Tabs */}
      <Tabs value={resolvedTab} onChange={(_, v: TabValue) => setActiveTab(v)} sx={{
        mb: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
        "& .MuiTab-root": { textTransform: "none", fontWeight: 500 },
        "& .Mui-selected": { fontWeight: 700 },
      }}>
        <Tab label="Overview" value="overview" />
        <Tab label="Live Results" value="live" />
        <Tab label={`Draft Results${draftCount > 0 ? ` (${draftCount})` : ""}`} value="draft" />
        <Tab label={`Log${log.length > 0 ? ` (${log.length})` : ""}`} value="log" />
      </Tabs>

      {/* ── Overview tab */}
      {resolvedTab === "overview" && (
        <OverviewTab columns={visibleLiveColumns} datasets={datasets} results={results} />
      )}

      {/* ── Live Results tab */}
      {resolvedTab === "live" && (
        <ResultsTableView
          {...sharedTableProps}
          {...filterProps("live")}
          datasets={liveDatasets}
          visibleColumns={visibleLiveColumns}
          emptyMessage="No live datasets available."
        />
      )}

      {/* ── Draft Results tab */}
      {resolvedTab === "draft" && (
        <ResultsTableView
          {...sharedTableProps}
          {...filterProps("draft")}
          datasets={draftDatasets}
          visibleColumns={visibleDraftColumns}
          emptyMessage="No draft datasets available."
        />
      )}

      {/* ── Log tab */}
      {resolvedTab === "log" && <LogTab log={log} running={running} />}
    </Box>
  );
}
