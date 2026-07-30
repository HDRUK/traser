import { Fragment, useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData, useNavigate, useRevalidator } from "react-router";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

import { requireAdmin } from "~/lib/auth.server";
import {
  readIndex,
  writeIndex,
  readRun,
  writeRun,
  upsertIndexEntry,
  toSummary,
  deleteRun as deleteRunFile,
  type BenchmarkRunSummary,
  type BenchmarkRun,
} from "~/lib/benchmarkStorage.server";
import {
  startBenchmark,
  buildInitialRun,
  isBenchmarkRunning,
  requestCancel,
  buildComparison,
  MAX_WORK_ITEMS,
  type RunComparison,
} from "~/lib/benchmark.server";
import { randomUUID } from "crypto";

import type { Route } from "./+types/benchmark";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

// ─── Loader ───────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

export async function loader({ request }: Route.LoaderArgs) {
  requireAdmin(request);
  const url = new URL(request.url);
  const compareA = url.searchParams.get("compareA");
  const compareB = url.searchParams.get("compareB");

  const index = await readIndex();

  // Stale-running-flag reset (server restart/crash), mirrors results.tsx.
  let indexChanged = false;
  for (const entry of index) {
    if (entry.running && !isBenchmarkRunning()) {
      entry.running = false;
      indexChanged = true;
      const run = await readRun(entry.id);
      if (run) {
        run.running = false;
        run.log = [...run.log, `[${ts()}] Detected stale running flag — reset (server restart or crash)`];
        await writeRun(run);
      }
    }
  }
  if (indexChanged) await writeIndex(index);

  const runningEntry = index.find((e) => e.running);
  const runningRun = runningEntry ? await readRun(runningEntry.id) : null;

  let comparison: RunComparison | null = null;
  let statsA: BenchmarkRunSummary["stats"] = undefined;
  let statsB: BenchmarkRunSummary["stats"] = undefined;
  let labelA: string | null = null;
  let labelB: string | null = null;

  if (compareA && compareB) {
    const [runA, runB] = await Promise.all([readRun(compareA), readRun(compareB)]);
    if (runA && runB) {
      comparison = buildComparison(runA, runB);
      statsA = runA.stats;
      statsB = runB.stats;
      labelA = runA.label;
      labelB = runB.label;
    }
  }

  return { index, runningRun, comparison, compareA, compareB, statsA, statsB, labelA, labelB };
}

// ─── Action ───────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "start") {
    if (isBenchmarkRunning()) return { error: "A benchmark is already running." };

    const label = String(formData.get("label") ?? "").trim();
    const baseUrl = String(formData.get("baseUrl") ?? "").trim();
    const schemaModel = String(formData.get("schemaModel") ?? "").trim();
    const schemaVersion = String(formData.get("schemaVersion") ?? "").trim();
    const start = Number(formData.get("start"));
    const end = Number(formData.get("end"));
    const repeat = Number(formData.get("repeat"));
    const concurrency = Number(formData.get("concurrency"));

    if (!label) return { error: "Label is required." };
    if (!baseUrl) return { error: "Base URL is required." };
    if (!schemaModel) return { error: "Schema model is required." };
    if (!schemaVersion) return { error: "Schema version is required." };
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      return { error: "Invalid ID range." };
    }
    if (!Number.isInteger(repeat) || repeat < 1) return { error: "Repeat count must be ≥ 1." };
    if (!Number.isInteger(concurrency) || concurrency < 1) return { error: "Concurrency must be ≥ 1." };

    const totalWork = (end - start + 1) * repeat;
    if (totalWork > MAX_WORK_ITEMS) {
      return { error: `Range × repeat = ${totalWork.toLocaleString()} exceeds the ${MAX_WORK_ITEMS.toLocaleString()} cap. Narrow the range or lower repeat.` };
    }

    const index = await readIndex();
    if (index.some((e) => e.label.toLowerCase() === label.toLowerCase())) {
      return { error: `Label "${label}" is already in use — pick another.` };
    }

    const runId = randomUUID();
    const opts = { runId, label, baseUrl, schemaModel, schemaVersion, start, end, repeat, concurrency };

    // Persist the "running" record BEFORE firing the background job — startBenchmark()
    // itself starts with a real network call (id discovery) that can take a moment,
    // and this action returns immediately without awaiting it. Without this, the
    // fetcher's post-action revalidation can read index.json before any run exists
    // there, making the first click look like it did nothing.
    const initialRun = buildInitialRun(opts);
    await writeRun(initialRun);
    await upsertIndexEntry(toSummary(initialRun));

    startBenchmark(initialRun, opts).catch((err) => console.error("startBenchmark error:", err));
    return { started: true, runId };
  }

  if (intent === "cancel") {
    const cancelled = requestCancel();
    return cancelled ? { cancelled: true } : { error: "No benchmark is currently running." };
  }

  if (intent === "delete") {
    const runId = String(formData.get("runId") ?? "");
    const index = await readIndex();
    if (index.find((e) => e.id === runId)?.running) {
      return { error: "Cannot delete a run that is currently in progress." };
    }
    await deleteRunFile(runId);
    return { deleted: true };
  }

  return { error: "Unknown intent." };
}

export function meta() {
  return [{ title: "Endpoint Benchmark — TRASER" }];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatMs(ms: number | undefined): string {
  if (ms === undefined) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function StatsTable({ stats }: { stats: BenchmarkRunSummary["stats"] }) {
  if (!stats) return <Typography variant="body2" color="text.secondary">No stats yet.</Typography>;
  const rows: Array<[string, string]> = [
    ["Requests", stats.count.toLocaleString()],
    ["Success rate", `${Math.round(stats.successRate * 100)}%`],
    ["Min", formatMs(stats.min)],
    ["Median", formatMs(stats.median)],
    ["Mean", formatMs(stats.mean)],
    ["p95", formatMs(stats.p95)],
    ["Max", formatMs(stats.max)],
  ];
  return (
    <Table size="small">
      <TableBody>
        {rows.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell sx={{ color: "text.secondary", border: 0, py: 0.25 }}>{k}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, border: 0, py: 0.25 }}>{v}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LogPanel({ log, running }: { log: string[]; running: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  if (log.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: "#0d1117", mt: 2 }}>
      {running && (
        <Box sx={{ px: 1.5, py: 0.5, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <Typography variant="caption" sx={{ color: "#58a6ff", fontFamily: "monospace" }}>● Running…</Typography>
        </Box>
      )}
      <Box sx={{ maxHeight: 260, overflowY: "auto", px: 1.5, py: 1, fontFamily: "monospace", fontSize: "0.72rem", color: "#c9d1d9", lineHeight: 1.6 }}>
        {log.map((line, i) => <div key={i}>{line}</div>)}
        <div ref={bottomRef} />
      </Box>
    </Paper>
  );
}

// ─── Run tab ────────────────────────────────────────────────────────────

function RunTab({ runningRun, duplicateFrom, onConsumeDuplicate }: {
  runningRun: BenchmarkRun | null;
  duplicateFrom: BenchmarkRunSummary | null;
  onConsumeDuplicate: () => void;
}) {
  const fetcher = useFetcher<typeof action>();
  const cancelFetcher = useFetcher<typeof action>();
  const busy = runningRun != null || fetcher.state !== "idle";
  const progress = runningRun?.progress;
  const pct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;

  // Once a duplicated run's config has been submitted, clear it so a later
  // visit to this tab starts from the plain defaults again.
  useEffect(() => {
    if (fetcher.data && "started" in fetcher.data && fetcher.data.started) onConsumeDuplicate();
  }, [fetcher.data, onConsumeDuplicate]);

  return (
    <Box>
      {duplicateFrom && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Prefilled from <strong>{duplicateFrom.label}</strong> — edit and start when ready.
        </Typography>
      )}
      {/* key remounts the form (and its uncontrolled defaultValues) whenever the duplicate source changes */}
      <fetcher.Form method="post" key={duplicateFrom?.id ?? "blank"}>
        <input type="hidden" name="intent" value="start" />
        <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2, maxWidth: 640 }}>
          <TextField name="label" label="Run label" size="small" required disabled={busy}
            placeholder="e.g. prod-2026-07-17"
            defaultValue={duplicateFrom ? `${duplicateFrom.label} (copy)` : undefined} />
          <TextField name="baseUrl" label="Gateway API base URL" size="small" required disabled={busy}
            placeholder="https://api.prod.hdruk.cloud/api/v2"
            defaultValue={duplicateFrom?.baseUrl ?? "https://api.prod.hdruk.cloud/api/v2"} />
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField name="schemaModel" label="Schema model" size="small" required disabled={busy}
              placeholder="GWDM" defaultValue={duplicateFrom?.schemaModel ?? "GWDM"} sx={{ flex: 1 }} />
            <TextField name="schemaVersion" label="Schema version" size="small" required disabled={busy}
              placeholder="2.0" defaultValue={duplicateFrom?.schemaVersion ?? "2.0"} sx={{ flex: 1 }} />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            Fetches <code>{"{baseUrl}"}/datasets/{"{id}"}?schema_model={"{schema model}"}&schema_version={"{schema version}"}</code>
          </Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField name="start" label="ID range start" type="number" size="small" required disabled={busy}
              defaultValue={duplicateFrom?.idRangeStart ?? 1} sx={{ flex: 1 }} />
            <TextField name="end" label="ID range end" type="number" size="small" required disabled={busy}
              defaultValue={duplicateFrom?.idRangeEnd ?? 10} sx={{ flex: 1 }} />
          </Box>
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField name="repeat" label="Repeats per ID" type="number" size="small" required disabled={busy}
              defaultValue={duplicateFrom?.repeat ?? 1} sx={{ flex: 1 }} />
            <TextField name="concurrency" label="Concurrency" type="number" size="small" required disabled={busy}
              defaultValue={duplicateFrom?.concurrency ?? 5} sx={{ flex: 1 }} />
          </Box>
          <Button type="submit" variant="contained" startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />} disabled={busy}>
            Start benchmark
          </Button>
          {fetcher.data?.error && (
            <Typography variant="body2" color="error">{fetcher.data.error}</Typography>
          )}
        </Paper>
      </fetcher.Form>

      {runningRun && (
        <Box sx={{ mt: 2, maxWidth: 640 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {progress?.completed ?? 0} / {progress?.total ?? 0} ({pct ?? 0}%)
            </Typography>
            <cancelFetcher.Form method="post">
              <input type="hidden" name="intent" value="cancel" />
              <Tooltip title="Stop this run — useful if it looks stuck (e.g. a slow/unresponsive endpoint)">
                <span>
                  <Button type="submit" size="small" color="warning" variant="outlined"
                    disabled={cancelFetcher.state !== "idle"}>
                    Cancel
                  </Button>
                </span>
              </Tooltip>
            </cancelFetcher.Form>
          </Box>
          <LinearProgress variant={pct !== null ? "determinate" : "indeterminate"} value={pct ?? undefined} sx={{ borderRadius: 1 }} />
          <LogPanel log={runningRun.log} running={runningRun.running} />
        </Box>
      )}
    </Box>
  );
}

// ─── History tab ────────────────────────────────────────────────────────

function HistoryTab({ index, onDuplicate }: { index: BenchmarkRunSummary[]; onDuplicate: (run: BenchmarkRunSummary) => void }) {
  const fetcher = useFetcher();

  if (index.length === 0) {
    return <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>No benchmark runs yet.</Typography>;
  }

  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Label</TableCell>
              <TableCell>Base URL</TableCell>
              <TableCell>Schema</TableCell>
              <TableCell>Range</TableCell>
              <TableCell align="right">Repeat</TableCell>
              <TableCell align="right">Concurrency</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Median</TableCell>
              <TableCell align="right">p95</TableCell>
              <TableCell align="right">Success</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {[...index].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((run) => (
              <TableRow key={run.id} hover>
                <TableCell>{run.label}</TableCell>
                <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{run.baseUrl}</TableCell>
                <TableCell>{run.schemaModel ? `${run.schemaModel} ${run.schemaVersion}` : "—"}</TableCell>
                <TableCell>{run.idRangeStart}–{run.idRangeEnd}</TableCell>
                <TableCell align="right">{run.repeat}</TableCell>
                <TableCell align="right">{run.concurrency}</TableCell>
                <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  {run.running
                    ? <Chip size="small" label="Running" color="info" />
                    : <Chip size="small" icon={<CheckCircleIcon />} label="Complete" color="success" variant="outlined" />}
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
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="runId" value={run.id} />
                    <Tooltip title={run.running ? "Cannot delete a running run" : "Delete run"}>
                      <span>
                        <IconButton type="submit" size="small" aria-label={`Delete run ${run.label}`} disabled={run.running || fetcher.state !== "idle"}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </fetcher.Form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

// ─── Compare tab ────────────────────────────────────────────────────────

function renderValue(v: unknown): string {
  if (v === undefined) return "—";
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return String(v);
}

function CompareTab({ index, comparison, compareA, compareB, statsA, statsB, labelA, labelB }: {
  index: BenchmarkRunSummary[];
  comparison: RunComparison | null;
  compareA: string | null;
  compareB: string | null;
  statsA: BenchmarkRunSummary["stats"];
  statsB: BenchmarkRunSummary["stats"];
  labelA: string | null;
  labelB: string | null;
}) {
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
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel id="compareA-label">Run A</InputLabel>
          <Select labelId="compareA-label" label="Run A" value={selA} onChange={(e) => setSelA(e.target.value)}>
            {completed.map((r) => <MenuItem key={r.id} value={r.id}>{r.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel id="compareB-label">Run B</InputLabel>
          <Select labelId="compareB-label" label="Run B" value={selB} onChange={(e) => setSelB(e.target.value)}>
            {completed.map((r) => <MenuItem key={r.id} value={r.id}>{r.label}</MenuItem>)}
          </Select>
        </FormControl>
        <Button variant="contained" disabled={!selA || !selB || selA === selB}
          onClick={() => navigate(`/benchmark?compareA=${encodeURIComponent(selA)}&compareB=${encodeURIComponent(selB)}`)}>
          Compare
        </Button>
      </Box>

      {!comparison && (
        <Typography color="text.secondary">Pick two completed runs to compare.</Typography>
      )}

      {comparison && (
        <>
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
            <Paper variant="outlined" sx={{ p: 1.5, minWidth: 260 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{labelA}</Typography>
              <StatsTable stats={statsA} />
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.5, minWidth: 260 }}>
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
                    <Fragment key={c.id}>
                      <TableRow hover sx={{ cursor: c.diffs.length > 0 ? "pointer" : "default" }}
                        role={c.diffs.length > 0 ? "button" : undefined}
                        tabIndex={c.diffs.length > 0 ? 0 : undefined}
                        aria-expanded={c.diffs.length > 0 ? expanded.has(c.id) : undefined}
                        onClick={() => c.diffs.length > 0 && toggleExpanded(c.id)}
                        onKeyDown={c.diffs.length > 0 ? (e) => {
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(c.id); }
                        } : undefined}>
                        <TableCell sx={{ width: 32 }}>
                          {c.diffs.length > 0 && (
                            <IconButton size="small" tabIndex={-1} aria-label={expanded.has(c.id) ? `Collapse diffs for id ${c.id}` : `Expand diffs for id ${c.id}`}>
                              {expanded.has(c.id) ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            </IconButton>
                          )}
                        </TableCell>
                        <TableCell>{c.id}</TableCell>
                        <TableCell>
                          {c.changed
                            ? <Chip size="small" label="Changed" color="warning" variant="outlined" />
                            : <Chip size="small" label="Identical" color="success" variant="outlined" />}
                        </TableCell>
                        <TableCell align="right">{c.diffs.length}</TableCell>
                      </TableRow>
                      {expanded.has(c.id) && c.diffs.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={4} sx={{ bgcolor: "action.hover" }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Path</TableCell>
                                  <TableCell>Before</TableCell>
                                  <TableCell>After</TableCell>
                                  <TableCell>Type</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {c.diffs.map((d, i) => (
                                  <TableRow key={i}>
                                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem" }}>{d.path}</TableCell>
                                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{renderValue(d.before)}</TableCell>
                                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{renderValue(d.after)}</TableCell>
                                    <TableCell>{d.changeType}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
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

// ─── Page ─────────────────────────────────────────────────────────────────

type TabValue = "run" | "history" | "compare";

export default function BenchmarkPage() {
  const { index, runningRun, comparison, compareA, compareB, statsA, statsB, labelA, labelB } =
    useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const [tab, setTab] = useState<TabValue>(compareA && compareB ? "compare" : "run");
  const [duplicateFrom, setDuplicateFrom] = useState<BenchmarkRunSummary | null>(null);

  useEffect(() => {
    if (!runningRun) return;
    const timer = setTimeout(() => revalidate(), 3_000);
    return () => clearTimeout(timer);
  }, [runningRun, revalidate]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Endpoint Benchmark</Typography>

      <Tabs value={tab} onChange={(_, v: TabValue) => setTab(v)} sx={{
        mb: 2, borderBottom: "1px solid", borderColor: "divider",
        "& .MuiTab-root": { textTransform: "none", fontWeight: 500 },
        "& .Mui-selected": { fontWeight: 700 },
      }}>
        <Tab label="Run" value="run" />
        <Tab label={`History${index.length > 0 ? ` (${index.length})` : ""}`} value="history" />
        <Tab label="Compare" value="compare" />
      </Tabs>

      {tab === "run" && (
        <RunTab runningRun={runningRun} duplicateFrom={duplicateFrom} onConsumeDuplicate={() => setDuplicateFrom(null)} />
      )}
      {tab === "history" && (
        <HistoryTab index={index} onDuplicate={(run) => { setDuplicateFrom(run); setTab("run"); }} />
      )}
      {tab === "compare" && (
        <CompareTab index={index} comparison={comparison} compareA={compareA} compareB={compareB}
          statsA={statsA} statsB={statsB} labelA={labelA} labelB={labelB} />
      )}
    </Box>
  );
}
