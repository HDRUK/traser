import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { Pie, PieChart, Tooltip as RechartsTooltip } from "recharts";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
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
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FilterListIcon from "@mui/icons-material/FilterList";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import WarningIcon from "@mui/icons-material/Warning";

import { getDatasetIndex, readTestResults, writeTestResults } from "~/lib/cache.server";
import { listSchemas } from "~/lib/traser.server";
import { runAllTests, runSingleDataset, isRefreshRunning } from "~/lib/refresh.server";

import type { Route } from "./+types/results";

// ─── Loader ───────────────────────────────────────────────────────────────

export async function loader() {
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

  return {
    datasets,
    schemas,
    results: cache.results ?? {},
    lastUpdated: cache.lastUpdated ?? null,
    running: cache.running ?? false,
    progress: cache.progress ?? null,
    log: cache.log ?? [],
  };
}

// ─── Action ───────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "single") {
    const pid = formData.get("pid");
    if (typeof pid === "string" && pid) await runSingleDataset(pid);
    return { done: true };
  }

  const cache = await readTestResults();
  cache.running = true;
  cache.results ??= {};
  await (await import("~/lib/cache.server")).writeTestResults(cache);

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
}

function buildColumns(schemas: Record<string, string[]>): Column[] {
  const cols: Column[] = [];
  const added = new Set<string>();

  const push = (schema: string, version: string) => {
    const key = `${schema}:${version}`;
    if (added.has(key)) return;
    cols.push({ schema, version, key });
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
  onCellClick: (colKey: string, status: CellStatus, result: ResultEntry) => void;
}

function DatasetRow({ pid, title, gatewayId, datasetStatus, columns, results, onCellClick }: RowProps) {
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
                <IconButton type="submit" size="small" disabled={isLoading} sx={{ p: "2px", flexShrink: 0 }}>
                  {isLoading ? <CircularProgress size={12} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                </IconButton>
              </span>
            </Tooltip>
          </fetcher.Form>
        </Box>
      </TableCell>

      {columns.map(({ key, schema }, idx) => {
        const status = cellStatus(pid, key, results);
        const r = results[pid]?.[key];
        const tooltipLabel = (status === "failed" || status === "invalid") && r?.reason ? r.reason : STATUS_LABEL[status];
        const clickable = !isLoading && (status === "failed" || status === "invalid");
        const isReference = key === "GWDM:2.0";
        const isGroupEnd = !isReference && idx < columns.length - 1 && columns[idx + 1].schema !== schema;
        return (
          <TableCell key={key} align="center" padding="none"
            sx={{
              py: 0.25,
              cursor: clickable ? "pointer" : "default",
              "&:hover": clickable ? { bgcolor: "action.hover" } : undefined,
              ...(isReference && { borderRight: "3px solid #FFD54F" }),
              ...(isGroupEnd && { borderRight: "2px solid rgba(255,255,255,0.1)" }),
            }}
            onClick={clickable && r ? () => onCellClick(key, status, r) : undefined}>
            {isLoading ? <CircularProgress size={14} /> : (
              <Tooltip title={clickable ? `${tooltipLabel} — click for details` : tooltipLabel}>
                <span>{STATUS_ICON[status]}</span>
              </Tooltip>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

// ─── Error detail dialog ──────────────────────────────────────────────────

interface DetailDialogProps {
  open: boolean;
  colKey: string;
  status: CellStatus;
  result: ResultEntry | null;
  onClose: () => void;
}

function ErrorDetailDialog({ open, colKey, status, result, onClose }: DetailDialogProps) {
  const [copied, setCopied] = useState(false);
  const body = status === "failed"
    ? (result?.translateBody ?? { message: result?.reason ?? "No details available" })
    : (result?.validateBody ?? { details: result?.reason ?? "No details available" });
  const jsonStr = JSON.stringify(body, null, 2);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{colKey}</Typography>
          <Typography variant="caption" color={status === "failed" ? "error.main" : "warning.main"}>
            {STATUS_LABEL[status]}
          </Typography>
        </Box>
        <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
          <IconButton size="small" onClick={() => { navigator.clipboard.writeText(jsonStr).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Box component="pre" sx={{ m: 0, p: 2, bgcolor: "#0d1117", color: "#c9d1d9", fontFamily: "monospace", fontSize: "0.75rem", lineHeight: 1.6, overflow: "auto", maxHeight: "60vh" }}>
          {jsonStr}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Overview tab — per-schema pie charts ─────────────────────────────────

const PIE_COLOURS: Record<CellStatus, string> = {
  ok:      "#4caf50",
  invalid: "#ff9800",
  failed:  "#f44336",
  pending: "#616161",
};

interface SchemaStats { ok: number; invalid: number; failed: number; pending: number }

function computeStats(colKey: string, datasets: Array<{ pid: string }>, results: ResultsMap): SchemaStats {
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
  datasets: Array<{ pid: string; title: string }>;
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

// ─── Page ─────────────────────────────────────────────────────────────────

type TabValue = "overview" | "table" | "log";

export default function ResultsPage() {
  const { datasets, schemas, results, lastUpdated, running, progress, log } =
    useLoaderData<typeof loader>();

  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();

  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [columnFilters, setColumnFilters] = useState<ColFilterMap>({});
  const [filterAnchor, setFilterAnchor] = useState<{ el: HTMLElement; colKey: string } | null>(null);
  const [detailCell, setDetailCell] = useState<{ colKey: string; status: CellStatus; result: ResultEntry } | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showDrafts, setShowDrafts] = useState<boolean>(true);
  const [colMenuAnchor, setColMenuAnchor] = useState<HTMLElement | null>(null);

  // Auto-revalidate every 5 s while running
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => revalidate(), 5_000);
    return () => clearTimeout(timer);
  }, [running, revalidate, progress]);

  useEffect(() => { setPage(0); }, [searchTerm, columnFilters]);

  const columns = buildColumns(schemas);
  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));

  function clearColumnFilter(colKey: string) {
    setColumnFilters((prev) => { const next = { ...prev }; delete next[colKey]; return next; });
  }

  const hasActiveFilters = Object.values(columnFilters).some((s) => s.size > 0);
  const draftCount = datasets.filter((d: { status?: string }) => d.status === "DRAFT").length;
  const filtered = datasets
    .filter((d: { title: string }) => !searchTerm.trim() || d.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((d: { status?: string }) => showDrafts || d.status !== "DRAFT")
    .filter((d: { pid: string }) => rowPassesFilters(d.pid, columnFilters, results as ResultsMap));
  const pageRows = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const isRefreshAllBusy = running || fetcher.state !== "idle";
  const progressPct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;

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
          {columns.map(({ key, schema, version }) => (
            <MenuItem key={key} dense onClick={() => setHiddenCols((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}>
              <Checkbox size="small" checked={!hiddenCols.has(key)} disableRipple sx={{ p: 0, mr: 1 }} />
              <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: GROUP_COLOURS[schema] ?? "grey.700", mr: 1, flexShrink: 0 }} />
              <ListItemText primary={`${schema} ${version}`} />
            </MenuItem>
          ))}
        </Menu>

        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="all" />
          <Button type="submit" variant="contained"
            startIcon={isRefreshAllBusy ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
            disabled={isRefreshAllBusy} size="small">
            Refresh All
          </Button>
        </fetcher.Form>
      </Box>

      {running && (
        <LinearProgress variant={progressPct !== null ? "determinate" : "indeterminate"}
          value={progressPct ?? undefined} sx={{ mb: 1.5, borderRadius: 1 }} />
      )}

      {/* ── Tabs */}
      <Tabs value={activeTab} onChange={(_, v: TabValue) => setActiveTab(v)} sx={{
        mb: 2,
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        "& .MuiTab-root": { color: "rgba(255,255,255,0.55)", textTransform: "none", fontWeight: 500 },
        "& .Mui-selected": { color: "#fff", fontWeight: 700 },
      }}>
        <Tab label="Overview" value="overview" />
        <Tab label="Results Table" value="table" />
        <Tab label={`Log${log.length > 0 ? ` (${log.length})` : ""}`} value="log" />
      </Tabs>

      {/* ── Overview tab */}
      {activeTab === "overview" && (
        <OverviewTab columns={visibleColumns} datasets={datasets} results={results as ResultsMap} />
      )}

      {/* ── Results Table tab */}
      {activeTab === "table" && (
        <Box>
          {/* Legend */}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            {(["ok", "invalid", "failed", "pending"] as CellStatus[]).map((s) => (
              <Chip key={s} icon={STATUS_ICON[s]} label={STATUS_LABEL[s]} size="small" variant="outlined"
                sx={{ "& .MuiChip-icon": { ml: "6px", color: STATUS_ICON_COLOUR[s] } }} />
            ))}
          </Box>

          {/* Search */}
          <TextField size="small" placeholder="Search datasets…" value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} sx={{ mb: 1, width: 360 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />

          {/* Active filter chips */}
          {hasActiveFilters && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
              {Object.entries(columnFilters).filter(([, s]) => s.size > 0).map(([colKey, statuses]) => (
                <Chip key={colKey} size="small" label={`${colKey}: ${Array.from(statuses).join(", ")}`} onDelete={() => clearColumnFilter(colKey)} />
              ))}
              <Chip size="small" label="Clear all filters" variant="outlined" onClick={() => setColumnFilters({})} />
            </Box>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {filtered.length} of {datasets.length} datasets
            {hiddenCols.size > 0 && ` · ${hiddenCols.size} column${hiddenCols.size > 1 ? "s" : ""} hidden`}
          </Typography>

          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ position: "sticky", left: 0, zIndex: 3, bgcolor: "background.paper", minWidth: 260, fontWeight: 700, py: 0.75 }}>
                      Dataset
                    </TableCell>
                    {visibleColumns.map(({ schema, version, key }, idx) => {
                      const filterActive = (columnFilters[key]?.size ?? 0) > 0;
                      const isReference = key === "GWDM:2.0";
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
                  {pageRows.map(({ pid, title, gatewayId, status: dStatus }: { pid: string; title: string; gatewayId?: string; status?: string }) => (
                    <DatasetRow key={pid} pid={pid} title={title} gatewayId={gatewayId} datasetStatus={dStatus}
                      columns={visibleColumns} results={results as ResultsMap}
                      onCellClick={(colKey, status, result) => setDetailCell({ colKey, status, result })} />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination component="div" count={filtered.length} page={page}
              onPageChange={(_, p) => setPage(p)} rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[25, 50, 100]} />
          </Paper>
        </Box>
      )}

      {/* ── Log tab */}
      {activeTab === "log" && <LogTab log={log} running={running} />}

      {/* ── Column filter popover */}
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
                setColumnFilters((prev) => { const next = { ...prev }; if (newValues.length === 0) delete next[colKey]; else next[colKey] = new Set(newValues as CellStatus[]); return next; });
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

      {/* ── Error detail dialog */}
      <ErrorDetailDialog open={!!detailCell} colKey={detailCell?.colKey ?? ""} status={detailCell?.status ?? "pending"}
        result={detailCell?.result ?? null} onClose={() => setDetailCell(null)} />
    </Box>
  );
}
