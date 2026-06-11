import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { EditorProps } from "@monaco-editor/react";
import jsonata from "jsonata";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FindInPageIcon from "@mui/icons-material/FindInPage";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

// ─── Default content ─────────────────────────────────────────────────────────

const DEFAULT_JSON = JSON.stringify(
  {
    required: {
      gatewayId: "1234",
      gatewayPid: "abc-123",
      issued: "2024-01-01T00:00:00Z",
      modified: "2024-06-01T00:00:00Z",
      revisions: [{ version: "1.0.0", url: "https://example.com/dataset/1" }],
    },
    summary: {
      title: "My Example Dataset",
      abstract: "A short description of this dataset.",
      contactPoint: "contact@example.com",
      keywords: "health,data,example",
      datasetType: "Health and disease",
      publisher: { publisherName: "Example Organisation" },
    },
    coverage: {
      spatial: "England",
      typicalAgeRange: "18-65",
      followUp: "6 months",
    },
    provenance: {
      origin: { purpose: "Research", source: "EPR" },
      temporal: {
        startDate: "2010-01-01",
        endDate: "2023-12-31",
        accrualPeriodicity: "Annual",
      },
    },
  },
  null,
  2
);

const DEFAULT_TEMPLATE = `/* JSONata template — source object is { input, extra }
   Try: input.summary.title  or  input.summary.keywords ~> $split(";,")
*/
{
  "title": input.summary.title,
  "keywords": input.summary.keywords,
  "publisher": input.summary.publisher.publisherName,
  "spatial": input.coverage.spatial
}`;

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    ((...args) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    }) as T,
    [fn, delay]
  );
}

function EditorSkeleton() {
  return (
    <Box sx={{ height: "100%", bgcolor: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Typography variant="caption" color="text.disabled" sx={{ fontFamily: "monospace" }}>
        Loading editor…
      </Typography>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JSONata Playground — TRASER" }];
}

interface DatasetOption { pid: string; title: string; gatewayId?: string }
interface TemplateOption { input_model: string; input_version: string; output_model: string; output_version: string }

interface FindMatch {
  name: string;
  version: string;
  matches: boolean;
  errors?: Array<{ instancePath?: string; message?: string; params?: Record<string, unknown> }> | null;
}

export default function PlaygroundPage() {
  const [jsonText, setJsonText] = useState(DEFAULT_JSON);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // ── Dropdown options (loaded client-side)
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // ── Find-schemas dialog state
  const [findResults, setFindResults] = useState<FindMatch[] | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [findSource, setFindSource] = useState<"input" | "result" | null>(null);
  const [finding, setFinding] = useState<"input" | "result" | null>(null);

  async function runFind(source: "input" | "result", jsonString: string) {
    setFinding(source);
    setFindSource(source);
    setFindError(null);
    try {
      const parsed = JSON.parse(jsonString);
      const res = await fetch("/find?with_errors=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) {
        setFindError(data?.message ?? `HTTP ${res.status}`);
        setFindResults([]);
      } else {
        setFindResults(data as FindMatch[]);
      }
    } catch (err) {
      setFindError(`Invalid JSON in ${source}: ${err}`);
      setFindResults([]);
    } finally {
      setFinding(null);
    }
  }

  useEffect(() => {
    fetch("/list/datasets").then(r => r.json()).then(setDatasets).catch(() => {});
    fetch("/list/templates").then(r => r.json()).then(setTemplates).catch(() => {});
  }, []);

  async function handleDatasetSelect(opt: DatasetOption | null) {
    if (!opt) return;
    setLoadingDataset(true);
    try {
      const res = await fetch(`/get/dataset?pid=${encodeURIComponent(opt.pid)}`);
      const data = await res.json();
      setJsonText(JSON.stringify(data, null, 2));
    } catch { /* ignore */ } finally {
      setLoadingDataset(false);
    }
  }

  async function handleTemplateSelect(opt: TemplateOption | null) {
    if (!opt) return;
    setLoadingTemplate(true);
    try {
      const res = await fetch(
        `/get/map?input_schema=${encodeURIComponent(opt.input_model)}&input_version=${encodeURIComponent(opt.input_version)}&output_schema=${encodeURIComponent(opt.output_model)}&output_version=${encodeURIComponent(opt.output_version)}`
      );
      const data = await res.json();
      if (data.translation_map) setTemplate(data.translation_map);
    } catch { /* ignore */ } finally {
      setLoadingTemplate(false);
    }
  }

  // Monaco must only load client-side — SSR doesn't support it
  const [Editor, setEditor] = useState<ComponentType<EditorProps> | null>(null);
  useEffect(() => {
    import("@monaco-editor/react").then((m) => setEditor(() => m.default));
  }, []);

  // Live ref so debounced callback always reads latest values
  const jsonRef = useRef(jsonText);
  const templateRef = useRef(template);
  jsonRef.current = jsonText;
  templateRef.current = template;

  const evaluate = useCallback(async (jText: string, tpl: string) => {
    setIsRunning(true);
    try {
      const input = JSON.parse(jText);
      const expr = jsonata(tpl);
      const res = await expr.evaluate({ input, extra: {} });
      setResult(res === undefined ? "undefined" : JSON.stringify(res, null, 2));
      setError(null);
    } catch (err) {
      setError(String(err));
      setResult("");
    } finally {
      setIsRunning(false);
    }
  }, []);

  const debouncedEvaluate = useDebounce(evaluate, 300);

  // Auto-run on mount and on every change
  useEffect(() => {
    debouncedEvaluate(jsonText, template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonText, template]);

  function handleBeautify() {
    try {
      setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2));
    } catch {
      setError("Cannot beautify: invalid JSON");
    }
  }

  function handleRun() {
    evaluate(jsonRef.current, templateRef.current);
  }

  const EDITOR_OPTS = { minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: "on" as const };
  const PANEL_HEADER = { display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75, bgcolor: "#1e1e1e", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)", overflow: "hidden" }}>
      {/* ── Top toolbar ── */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1, bgcolor: "background.paper", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          JSONata Playground
        </Typography>
        {isRunning && <Chip label="Running…" size="small" sx={{ fontFamily: "monospace", fontSize: "0.7rem" }} />}
        {error && <Chip label="Error" size="small" color="error" />}
        {!error && result && <Chip label="OK" size="small" color="success" />}
        <Button size="small" variant="outlined" startIcon={<PlayArrowIcon />} onClick={handleRun}>
          Run
        </Button>
      </Box>

      {/* ── Dataset / template selectors ── */}
      <Box sx={{ display: "flex", gap: 2, px: 2, py: 1, bgcolor: "background.paper", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <Autocomplete
          options={datasets}
          getOptionLabel={(o) => o.title}
          onChange={(_, v) => handleDatasetSelect(v)}
          loading={loadingDataset || datasets.length === 0}
          loadingText={datasets.length === 0 ? "Loading datasets…" : "Fetching dataset…"}
          size="small"
          sx={{ flex: 1 }}
          renderInput={(params) => (
            <TextField {...params} label="Load dataset…" placeholder="Search 1135 datasets by title" />
          )}
        />
        <Autocomplete
          options={templates}
          getOptionLabel={(o) => `${o.input_model} ${o.input_version} → ${o.output_model} ${o.output_version}`}
          onChange={(_, v) => handleTemplateSelect(v)}
          loading={loadingTemplate || templates.length === 0}
          loadingText={templates.length === 0 ? "Loading templates…" : "Fetching template…"}
          size="small"
          sx={{ flex: 1 }}
          renderInput={(params) => (
            <TextField {...params} label="Load mapping file…" placeholder="e.g. GWDM 2.0 → HDRUK 4.0.0" />
          )}
        />
      </Box>

      {/* ── Main split layout ── */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT: JSON input ── */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
          <Box sx={{ ...PANEL_HEADER }}>
            <Typography variant="caption" sx={{ fontWeight: 600, flex: 1, color: "text.secondary", fontFamily: "monospace" }}>
              JSON INPUT
            </Typography>
            <Button size="small" startIcon={<FindInPageIcon sx={{ fontSize: 14 }} />}
              onClick={() => runFind("input", jsonRef.current)} disabled={finding === "input"}
              sx={{ py: 0, fontSize: "0.7rem" }}>
              {finding === "input" ? "Finding…" : "Find Schemas"}
            </Button>
            <Button size="small" startIcon={<AutoFixHighIcon sx={{ fontSize: 14 }} />} onClick={handleBeautify} sx={{ py: 0, fontSize: "0.7rem" }}>
              Beautify
            </Button>
          </Box>
          <Box sx={{ flex: 1, overflow: "hidden" }}>
            {Editor ? (
              <Editor height="100%" language="json" theme="vs-dark" value={jsonText}
                onChange={(v) => setJsonText(v ?? "")} options={EDITOR_OPTS} />
            ) : <EditorSkeleton />}
          </Box>
        </Box>

        {/* ── RIGHT: template + result ── */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>

          {/* ── Top right: JSONata template ── */}
          <Box sx={{ flex: "0 0 45%", display: "flex", flexDirection: "column", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <Box sx={{ ...PANEL_HEADER }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontFamily: "monospace" }}>
                JSONATA TEMPLATE
              </Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: "hidden" }}>
              {Editor ? (
                <Editor height="100%" language="javascript" theme="vs-dark" value={template}
                  onChange={(v) => setTemplate(v ?? "")}
                  options={{
                    ...EDITOR_OPTS,
                    // JSONata ≠ JavaScript — suppress JS syntax/semantic errors
                    "semanticHighlighting.enabled": false,
                  }}
                  beforeMount={(monaco) => {
                    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                      noSemanticValidation: true,
                      noSyntaxValidation: true,
                    });
                  }}
                />
              ) : <EditorSkeleton />}
            </Box>
          </Box>

          {/* ── Bottom right: result ── */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <Box sx={{ ...PANEL_HEADER }}>
              <Typography variant="caption" sx={{ fontWeight: 600, flex: 1, color: error ? "#f87171" : "text.secondary", fontFamily: "monospace" }}>
                {error ? "ERROR" : "RESULT"}
              </Typography>
              {!error && result && (
                <Button size="small" startIcon={<FindInPageIcon sx={{ fontSize: 14 }} />}
                  onClick={() => runFind("result", result)} disabled={finding === "result"}
                  sx={{ py: 0, fontSize: "0.7rem" }}>
                  {finding === "result" ? "Finding…" : "Find Schemas"}
                </Button>
              )}
            </Box>
            <Box sx={{ flex: 1, overflow: "hidden" }}>
              {error ? (
                <Box sx={{ p: 2, fontFamily: "monospace", fontSize: "0.78rem", color: "#f87171", whiteSpace: "pre-wrap", overflow: "auto", height: "100%" }}>
                  {error}
                </Box>
              ) : Editor ? (
                <Editor height="100%" language="json" theme="vs-dark" value={result}
                  options={{ ...EDITOR_OPTS, readOnly: true }} />
              ) : <EditorSkeleton />}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Find Schemas dialog ── */}
      <Dialog open={findResults !== null} onClose={() => setFindResults(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
          <FindInPageIcon fontSize="small" sx={{ color: "primary.light" }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Schema match results
              {findSource && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
                  — {findSource === "input" ? "JSON input" : "translation result"}
                </Typography>
              )}
            </Typography>
            {findResults && (
              <Typography variant="caption" color="text.secondary">
                {findResults.filter(r => r.matches).length} of {findResults.length} schemas matched
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={() => setFindResults(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          {findError && (
            <Box sx={{ p: 2, color: "error.main", fontFamily: "monospace", fontSize: "0.78rem" }}>{findError}</Box>
          )}

          {findResults && findResults.length > 0 && (
            <>
              {/* Summary table */}
              <Table size="small" sx={{ "& th": { fontWeight: 700, bgcolor: "background.paper" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 48 }}></TableCell>
                    <TableCell>Schema</TableCell>
                    <TableCell>Version</TableCell>
                    <TableCell align="right">Errors</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {findResults.map((r) => (
                    <TableRow key={`${r.name}:${r.version}`} hover>
                      <TableCell>
                        {r.matches
                          ? <CheckCircleIcon sx={{ color: "success.main", fontSize: 20 }} />
                          : <CancelIcon sx={{ color: "error.main", fontSize: 20 }} />}
                      </TableCell>
                      <TableCell><strong>{r.name}</strong></TableCell>
                      <TableCell>{r.version}</TableCell>
                      <TableCell align="right">
                        <Typography variant="caption" color={r.matches ? "success.main" : "text.secondary"}>
                          {r.matches ? "matches" : `${r.errors?.length ?? 0} error${r.errors?.length === 1 ? "" : "s"}`}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Error details per non-matching schema */}
              <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.08)", p: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Expand a non-matching schema to see validation errors:
                </Typography>
                {findResults.filter(r => !r.matches && (r.errors?.length ?? 0) > 0).map((r) => (
                  <Accordion key={`err-${r.name}:${r.version}`} disableGutters sx={{ bgcolor: "background.default" }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />}>
                      <Typography variant="body2"><strong>{r.name} {r.version}</strong> — {r.errors!.length} error{r.errors!.length === 1 ? "" : "s"}</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 0, bgcolor: "#0d1117" }}>
                      <Box component="pre" sx={{ m: 0, p: 1.5, fontFamily: "monospace", fontSize: "0.72rem", color: "#c9d1d9", maxHeight: 280, overflow: "auto" }}>
                        {(r.errors ?? []).map((e, i) =>
                          `${i + 1}. ${e.instancePath || "(root)"}: ${e.message ?? "error"}${e.params ? ` ${JSON.stringify(e.params)}` : ""}`
                        ).join("\n")}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            </>
          )}

          {findResults && findResults.length === 0 && !findError && (
            <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>No schemas tested.</Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
