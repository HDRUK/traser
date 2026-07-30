import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import LinkIcon from "@mui/icons-material/Link";
import type { EditorProps } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import jsonata from "jsonata";

import Collapse from "@mui/material/Collapse";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FindInPageIcon from "@mui/icons-material/FindInPage";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";


import { playgroundStore, type SchemaRef } from "../stores/playgroundStore";
import { DEFAULT_JSON } from "../config/playgroundDefaults";
import type { Route } from "./+types/playground";
import { getDatasetIndex } from "~/lib/cache.server";
import { getAvailableTemplates } from "~/lib/templates.server";
import { ensureLoaded, getAvailableSchemas } from "~/lib/schema.server";

// Upper bound on a template decoded from a share link, before it is seeded and
// auto-evaluated. Guards against a maliciously large/expensive expression in a
// URL freezing the tab on open.
const MAX_SHARED_TEMPLATE_CHARS = 20_000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface DatasetOption { pid: string; title: string; gatewayId?: string }
interface TemplateOption { input_model: string; input_version: string; output_model: string; output_version: string }
interface ValidationError {
  instancePath?: string;
  message?: string;
  params?: Record<string, unknown>;
  suggestion?: string;
  invalidValue?: unknown;
  allowedValues?: unknown[];
}
interface FindMatch {
  name: string;
  version: string;
  matches: boolean;
  errors?: Array<ValidationError> | null;
}
type ValidationState =
  | { kind: "unchecked" }
  | { kind: "checking" }
  | { kind: "valid" }
  | { kind: "invalid"; errors: Array<ValidationError> };

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

// Walks a JSON string and returns the start/end character offsets of the value
// at the given JSON Pointer instance path (e.g. "/provenance/origin/datasetType/0/subTypes/1").
function findJsonPathRange(
  text: string,
  instancePath: string
): { startOffset: number; endOffset: number } | null {
  const segments = instancePath.replace(/^\//, "").split("/").filter(Boolean);
  let i = 0;

  const ws = () => { while (i < text.length && text[i] <= " ") i++; };

  function readStr(): string | null {
    if (text[i] !== '"') return null;
    i++;
    let s = "";
    while (i < text.length) {
      if (text[i] === "\\") {
        i++;
        const c = text[i++];
        if (c === "u") { s += String.fromCharCode(parseInt(text.slice(i, i + 4), 16)); i += 4; }
        else s += ({ '"': '"', "\\": "\\", "/": "/", n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[c] ?? c;
      } else if (text[i] === '"') { i++; return s; }
      else s += text[i++];
    }
    return null;
  }

  function skip(): boolean {
    ws();
    if (i >= text.length) return false;
    const ch = text[i];
    if (ch === '"') return readStr() !== null;
    if (ch === "{") {
      i++; ws();
      if (text[i] === "}") { i++; return true; }
      while (true) {
        ws(); if (readStr() === null) return false; ws();
        if (text[i++] !== ":") return false; ws();
        if (!skip()) return false; ws();
        if (text[i] === "}") { i++; return true; }
        if (text[i++] !== ",") return false;
      }
    }
    if (ch === "[") {
      i++; ws();
      if (text[i] === "]") { i++; return true; }
      while (true) {
        ws(); if (!skip()) return false; ws();
        if (text[i] === "]") { i++; return true; }
        if (text[i++] !== ",") return false;
      }
    }
    while (i < text.length && !/[\s,\]{}"]/.test(text[i])) i++;
    return true;
  }

  function nav(depth: number): { startOffset: number; endOffset: number } | null {
    ws();
    if (depth === segments.length) {
      const start = i;
      if (!skip()) return null;
      return { startOffset: start, endOffset: i };
    }
    const seg = segments[depth].replace(/~1/g, "/").replace(/~0/g, "~");
    if (text[i] === "{") {
      i++; ws();
      if (text[i] === "}") return null;
      while (true) {
        ws();
        const key = readStr(); if (key === null) return null; ws();
        if (text[i++] !== ":") return null; ws();
        if (key === seg) return nav(depth + 1);
        if (!skip()) return null; ws();
        if (text[i] === "}") return null;
        if (text[i++] !== ",") return null;
      }
    }
    if (text[i] === "[") {
      const idx = parseInt(seg, 10); if (isNaN(idx)) return null;
      i++; ws();
      if (text[i] === "]") return null;
      for (let n = 0; ; n++) {
        ws();
        if (n === idx) return nav(depth + 1);
        if (!skip()) return null; ws();
        if (text[i] === "]") return null;
        if (text[i++] !== ",") return null;
      }
    }
    return null;
  }

  try { return nav(0); } catch { return null; }
}

// Builds Monaco decorations from a list of AJV validation errors.
// Groups errors by instancePath so that anyOf/multi-branch failures on the
// same field produce one decoration with an aggregated hover, not N duplicates.
function buildValidationDecorations(
  errors: ValidationError[],
  text: string,
  model: MonacoEditorNS.ITextModel
): MonacoEditorNS.IModelDeltaDecoration[] {
  const DECO_OPTS = (hoverMessage: { value: string }): MonacoEditorNS.IModelDecorationOptions => ({
    inlineClassName: "traser-error-token",
    hoverMessage,
    overviewRuler: { color: "#f44336", position: 4 },
  });

  const decos: MonacoEditorNS.IModelDeltaDecoration[] = [];

  // Partition: addProp errors use text-search; all others are grouped by path
  const byPath = new Map<string, ValidationError[]>();
  const addPropErrors: ValidationError[] = [];

  for (const err of errors) {
    if (err.params?.additionalProperty) {
      addPropErrors.push(err);
    } else {
      const key = err.instancePath || "";
      if (!byPath.has(key)) byPath.set(key, []);
      byPath.get(key)!.push(err);
    }
  }

  // Path-based decorations — one per unique path, hover aggregates all errors at that path
  for (const [path, errs] of byPath) {
    if (!path) continue; // root-level errors have no specific location to highlight
    const hoverLines: string[] = [];
    if (errs.length === 1) {
      const e = errs[0];
      const invalidVal = typeof e.invalidValue === "string" ? e.invalidValue : undefined;
      hoverLines.push(`**${path}**: ${e.message ?? "error"}${invalidVal ? ` ("${invalidVal}")` : ""}`);
      if (e.allowedValues && e.allowedValues.length > 0) {
        hoverLines.push(`Allowed: ${e.allowedValues.map(v => JSON.stringify(v)).join(", ")}`);
      } else if (e.suggestion) {
        hoverLines.push(`*${e.suggestion}*`);
      }
    } else {
      hoverLines.push(`**${path}**: ${errs.length} errors`);
      hoverLines.push(errs.map(e => `- ${e.message ?? "error"}`).join("\n"));
    }
    const hoverMessage = { value: hoverLines.join("\n\n") };
    const offsets = findJsonPathRange(text, path);
    if (!offsets) continue;
    const start = model.getPositionAt(offsets.startOffset);
    const end   = model.getPositionAt(offsets.endOffset);
    decos.push({
      range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
      options: DECO_OPTS(hoverMessage),
    });
  }

  // additionalProperties decorations — text-search for the unexpected key name
  for (const err of addPropErrors) {
    const addProp = err.params!.additionalProperty as string;
    const hoverMessage = { value: `**${err.instancePath || "(root)"}**: ${err.message ?? "error"} ("${addProp}")` };
    const matches = model.findMatches(`"${addProp}"`, false, false, true, null, false);
    for (const match of matches) {
      decos.push({ range: match.range, options: DECO_OPTS(hoverMessage) });
    }
  }

  return decos;
}

function EditorSkeleton() {
  return (
    <Box sx={{ height: "100%", bgcolor: "background.paper", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Typography variant="caption" color="text.disabled" sx={{ fontFamily: "monospace" }}>
        Loading editor…
      </Typography>
    </Box>
  );
}

function LockedPanel({ message, onAction, actionLabel }: { message: string; onAction?: () => void; actionLabel?: string }) {
  return (
    <Box sx={{ height: "100%", bgcolor: "background.default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, p: 3 }}>
      <LockOutlinedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 340 }}>
        {message}
      </Typography>
      {onAction && actionLabel && (
        <Button size="small" variant="outlined" startIcon={<FindInPageIcon />} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}

// ─── Header badges ────────────────────────────────────────────────────────────
// Hoisted to module scope (not nested in PlaygroundPage) so they keep a stable
// component identity across the parent's frequent re-renders (every keystroke in
// the JSON editor) instead of remounting each time.

function InputBadge({ inputSchema, inputValidation, finding, onFind, onOpenPicker }: {
  inputSchema: SchemaRef | null;
  inputValidation: ValidationState;
  finding: "input" | "result" | null;
  onFind: () => void;
  onOpenPicker: () => void;
}) {
  if (!inputSchema) {
    return (
      <Chip size="small" variant="outlined"
        label={finding === "input" ? "Finding…" : "Find schema"}
        icon={<FindInPageIcon sx={{ fontSize: "12px !important" }} />}
        onClick={onFind}
        disabled={finding === "input"}
        sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer", borderColor: "primary.main", color: "primary.main", "& .MuiChip-icon": { color: "primary.main" } }} />
    );
  }
  const label = `${inputSchema.name} ${inputSchema.version}`;
  if (inputValidation.kind === "valid") {
    return <Chip size="small" icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} label={`Valid ${label}`}
      onClick={onOpenPicker}
      sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer", bgcolor: "rgba(76,175,80,0.15)", color: "success.light", "& .MuiChip-icon": { color: "success.main" } }} />;
  }
  if (inputValidation.kind === "invalid") {
    const firstErr = inputValidation.errors[0];
    const addProp = firstErr?.params?.additionalProperty as string | undefined;
    const invalidVal = typeof firstErr?.invalidValue === "string" ? firstErr.invalidValue : undefined;
    const valueTag = addProp ?? invalidVal;
    const tip = firstErr
      ? `${firstErr.instancePath || "(root)"}: ${firstErr.message ?? "error"}${valueTag ? ` ("${valueTag}")` : ""}${firstErr.suggestion ? ` — ${firstErr.suggestion}` : ""}`
      : "Invalid";
    return (
      <Tooltip title={tip}>
        <Chip size="small" icon={<CancelIcon sx={{ fontSize: 14 }} />} label={`Invalid as ${label}`}
          onClick={onOpenPicker}
          sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer", bgcolor: "rgba(244,67,54,0.15)", color: "error.light", "& .MuiChip-icon": { color: "error.main" } }} />
      </Tooltip>
    );
  }
  return <Chip size="small" label={`Checking ${label}…`}
    onClick={onOpenPicker}
    sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer", bgcolor: "rgba(255,255,255,0.06)", color: "text.secondary" }} />;
}

function OutputBadge({ outputSchema, validateOutputOn, outputValidation }: {
  outputSchema: SchemaRef | null;
  validateOutputOn: boolean;
  outputValidation: ValidationState;
}) {
  if (!outputSchema) {
    return (
      <Chip size="small" variant="outlined" label="No output schema"
        sx={{ height: 20, fontSize: "0.65rem", borderColor: "text.disabled", color: "text.secondary" }} />
    );
  }
  const label = `${outputSchema.name} ${outputSchema.version}`;
  if (!validateOutputOn) {
    return <Chip size="small" variant="outlined" label={`Output: ${label}`}
      sx={{ height: 20, fontSize: "0.65rem", borderColor: "text.disabled", color: "text.secondary" }} />;
  }
  if (outputValidation.kind === "valid") {
    return <Chip size="small" icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} label={`Valid ${label}`}
      sx={{ height: 20, fontSize: "0.65rem", bgcolor: "rgba(76,175,80,0.15)", color: "success.light", "& .MuiChip-icon": { color: "success.main" } }} />;
  }
  if (outputValidation.kind === "invalid") {
    const firstErr = outputValidation.errors[0];
    const addProp = firstErr?.params?.additionalProperty as string | undefined;
    const invalidVal = typeof firstErr?.invalidValue === "string" ? firstErr.invalidValue : undefined;
    const valueTag = addProp ?? invalidVal;
    const tip = firstErr
      ? `${firstErr.instancePath || "(root)"}: ${firstErr.message ?? "error"}${valueTag ? ` ("${valueTag}")` : ""}${firstErr.suggestion ? ` — ${firstErr.suggestion}` : ""}`
      : "Invalid";
    return (
      <Tooltip title={tip}>
        <Chip size="small" icon={<CancelIcon sx={{ fontSize: 14 }} />} label={`Invalid as ${label}`}
          sx={{ height: 20, fontSize: "0.65rem", bgcolor: "rgba(244,67,54,0.15)", color: "error.light", "& .MuiChip-icon": { color: "error.main" } }} />
      </Tooltip>
    );
  }
  return <Chip size="small" label={`Checking ${label}…`}
    sx={{ height: 20, fontSize: "0.65rem", bgcolor: "rgba(255,255,255,0.06)", color: "text.secondary" }} />;
}

// ─── Loader ─────────────────────────────────────────────────────────────────

// Reference data (datasets / templates / schemas) is loaded here — in parallel
// with the page — rather than via three client-side fetches after hydration.
// Each source degrades to empty on failure so a reference-data hiccup never
// blanks the whole playground.
export async function loader(_args: Route.LoaderArgs) {
  const [datasets, templates, schemas] = await Promise.all([
    getDatasetIndex().catch(() => []),
    getAvailableTemplates().catch(() => []),
    ensureLoaded()
      .then(() => getAvailableSchemas())
      .catch(() => ({}) as Record<string, string[]>),
  ]);
  return { datasets, templates, schemas };
}

export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

// ─── Page ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JSONata Playground — TRASER" }];
}

export default function PlaygroundPage() {
  // ── Persisted state (Zustand + localStorage)
  const {
    jsonText, template, inputSchema, customOutputSchema, validateOutputOn,
    hSplit, vSplit, leftCollapsed, rightCollapsed, templateCollapsed, resultCollapsed,
    selectedMapping, loadedTemplateText, selectedDataset,
    setJsonText, setTemplate, setInputSchema, setCustomOutputSchema, setValidateOutputOn,
    setHSplit, setVSplit, setLeftCollapsed, setRightCollapsed, setTemplateCollapsed, setResultCollapsed,
    setSelectedMapping, setLoadedTemplateText, setSelectedDataset,
    seed,
  } = playgroundStore();

  // ── Panel refs for programmatic collapse/expand
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const templatePanelRef = useRef<PanelImperativeHandle | null>(null);
  const resultPanelRef = useRef<PanelImperativeHandle | null>(null);
  const editorPanelRef = useRef<PanelImperativeHandle | null>(null);
  const errorsPanelRef = useRef<PanelImperativeHandle | null>(null);

  // Restore collapsed state on mount
  useEffect(() => {
    if (leftCollapsed) leftPanelRef.current?.collapse();
    if (rightCollapsed) rightPanelRef.current?.collapse();
    if (templateCollapsed) templatePanelRef.current?.collapse();
    if (resultCollapsed) resultPanelRef.current?.collapse();
    errorsPanelRef.current?.collapse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Editors
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);


  // ── Reference data (loaded server-side, available on first render)
  const { datasets, templates, schemas: schemaList } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [loadingDataset, setLoadingDataset] = useState(false);

  // ── Schema state
  const [inputValidation, setInputValidation] = useState<ValidationState>({ kind: "unchecked" });

  const [outputValidation, setOutputValidation] = useState<ValidationState>({ kind: "unchecked" });

  // ── Expanded allowed-values in error panel
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<number>>(new Set());
  useEffect(() => { setExpandedSuggestions(new Set()); }, [inputValidation]);

  // ── Find-schemas dialog
  const [findResults, setFindResults] = useState<FindMatch[] | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [findSource, setFindSource] = useState<"input" | "result" | null>(null);
  const [finding, setFinding] = useState<"input" | "result" | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [copied, setCopied] = useState(false);

  // ── Panel modals
  const [datasetOpen, setDatasetOpen] = useState(false);
  const [datasetFilter, setDatasetFilter] = useState("");
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingFilter, setMappingFilter] = useState("");
  const [schemaPickerOpen, setSchemaPickerOpen] = useState(false);
  const [schemaPickerFilter, setSchemaPickerFilter] = useState("");

  // ── Monaco
  const [Editor, setEditor] = useState<ComponentType<EditorProps> | null>(null);
  useEffect(() => {
    import("@monaco-editor/react").then((m) => setEditor(() => m.default));
  }, []);

  // ── Live refs
  const jsonRef = useRef(jsonText);
  const templateRef = useRef(template);
  jsonRef.current = jsonText;
  templateRef.current = template;
  const loadedDatasetJsonRef = useRef<string | null>(null);

  // ── Monaco editor refs for decoration support
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<MonacoEditorNS.IEditorDecorationsCollection | null>(null);
  const resultEditorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const resultDecorationsRef = useRef<MonacoEditorNS.IEditorDecorationsCollection | null>(null);

  // Seed loadedDatasetJsonRef from persisted jsonText on mount so a page refresh
  // with a saved dataset doesn't immediately show the chip as "(modified)".
  useEffect(() => {
    if (selectedDataset && loadedDatasetJsonRef.current === null) {
      loadedDatasetJsonRef.current = jsonText;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Store rehydration + share-link seeding
  useEffect(() => {
    // Rehydrate persisted store (deferred so SSR doesn't produce a mismatch)
    playgroundStore.persist.rehydrate();

    // If a share URL or results-cell link was opened, seed from URL params (takes priority over localStorage)
    const params = new URLSearchParams(window.location.search);
    const tpl  = params.get("tpl");
    const inS  = params.get("in");
    const outS = params.get("out");
    const pidP = params.get("pid");

    if (tpl || inS || outS || pidP) {
      const patch: Parameters<typeof seed>[0] = {};
      if (tpl) {
        try {
          const decoded = decodeURIComponent(atob(tpl));
          if (decoded.length <= MAX_SHARED_TEMPLATE_CHARS) patch.template = decoded;
          else console.warn(`Shared template exceeds ${MAX_SHARED_TEMPLATE_CHARS}-char cap — ignored`);
        } catch { /* malformed share link — ignore the template */ }
      }
      if (inS)  { const [name, ...rest] = inS.split(":"); patch.inputSchema = { name, version: rest.join(":") }; }
      if (outS) { const [name, ...rest] = outS.split(":"); patch.customOutputSchema = { name, version: rest.join(":") }; }
      if (inS && outS) patch.validateOutputOn = true;
      seed(patch);
      // Strip the processed query params via the router (keeps RR's history in sync)
      navigate(window.location.pathname, { replace: true, preventScrollReset: true });

      // Load dataset from cache when navigating from results table
      if (pidP) {
        setSelectedDataset({ pid: pidP, title: pidP }); // placeholder until datasets list resolves
        setLoadingDataset(true);
        fetch(`/get/dataset?pid=${encodeURIComponent(pidP)}`)
          .then(r => r.json())
          .then(data => {
            const text = JSON.stringify(data, null, 2);
            setJsonText(text);
            loadedDatasetJsonRef.current = text;
          })
          .catch(console.error)
          .finally(() => setLoadingDataset(false));
      }

      // Auto-load translation template when both in and out are provided (but no explicit tpl)
      if (inS && outS && !tpl) {
        const [inName, ...inRest] = inS.split(":");
        const [outName, ...outRest] = outS.split(":");
        const inVer = inRest.join(":");
        const outVer = outRest.join(":");
        if (`${inName}:${inVer}` !== `${outName}:${outVer}`) {
          fetch(`/get/map?input_schema=${encodeURIComponent(inName)}&input_version=${encodeURIComponent(inVer)}&output_schema=${encodeURIComponent(outName)}&output_version=${encodeURIComponent(outVer)}`)
            .then(r => r.json())
            .then(data => {
              if (data.translation_map) {
                setTemplate(data.translation_map);
                setLoadedTemplateText(data.translation_map);
                setSelectedMapping({ input_model: inName, input_version: inVer, output_model: outName, output_version: outVer });
              }
            })
            .catch(console.error);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve selectedDataset title from the datasets list (covers URL-seeded navigation and stale persisted titles)
  useEffect(() => {
    if (!selectedDataset || !datasets.length) return;
    const match = datasets.find(d => d.pid === selectedDataset.pid);
    if (match && match.title !== selectedDataset.title) {
      setSelectedDataset({ pid: selectedDataset.pid, title: match.title });
    }
  }, [datasets]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived: mapping mode, output schema, available templates

  const mappingMode: "known" | "custom" = useMemo(() => {
    if (!selectedMapping) return "custom";
    return template === loadedTemplateText ? "known" : "custom";
  }, [selectedMapping, template, loadedTemplateText]);

  const datasetMode: "none" | "loaded" | "modified" = useMemo(() => {
    if (!selectedDataset) return "none";
    if (loadedDatasetJsonRef.current === null) return "loaded";
    return jsonText === loadedDatasetJsonRef.current ? "loaded" : "modified";
  }, [selectedDataset, jsonText]);

  const outputSchema: SchemaRef | null = useMemo(() => {
    if (mappingMode === "known" && selectedMapping) {
      return { name: selectedMapping.output_model, version: selectedMapping.output_version };
    }
    return customOutputSchema;
  }, [mappingMode, selectedMapping, customOutputSchema]);

  const availableTemplates = useMemo(() => {
    if (!inputSchema) return [] as TemplateOption[];
    return templates.filter(
      (t) => t.input_model === inputSchema.name && t.input_version === inputSchema.version
    );
  }, [inputSchema, templates]);

  // Clear selected mapping if it's no longer valid for current input schema
  useEffect(() => {
    if (selectedMapping && inputSchema) {
      if (selectedMapping.input_model !== inputSchema.name || selectedMapping.input_version !== inputSchema.version) {
        setSelectedMapping(null);
        setLoadedTemplateText(null);
      }
    }
  }, [inputSchema, selectedMapping, setLoadedTemplateText, setSelectedMapping]);

  // ── Input validation (debounced)

  const runInputValidation = useCallback(async (jText: string, schema: SchemaRef | null) => {
    if (!schema) {
      setInputValidation({ kind: "unchecked" });
      return;
    }
    let metadata: unknown;
    try {
      metadata = JSON.parse(jText);
    } catch {
      setInputValidation({ kind: "invalid", errors: [{ message: "Invalid JSON" }] });
      return;
    }
    setInputValidation({ kind: "checking" });
    try {
      const res = await fetch(
        `/validate?input_schema=${encodeURIComponent(schema.name)}&input_version=${encodeURIComponent(schema.version)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata }) }
      );
      const body = await res.json();
      if (res.ok) {
        setInputValidation({ kind: "valid" });
      } else {
        setInputValidation({ kind: "invalid", errors: Array.isArray(body.details) ? body.details : [{ message: body.message ?? "Validation failed" }] });
      }
    } catch (err) {
      setInputValidation({ kind: "invalid", errors: [{ message: `Network error: ${err}` }] });
    }
  }, []);

  const debouncedInputValidate = useDebounce(runInputValidation, 400);

  useEffect(() => {
    debouncedInputValidate(jsonText, inputSchema);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonText, inputSchema]);

  // ── JSONata evaluation (only runs when input is valid)

  const inputUnlocked = inputValidation.kind === "valid";

  const evaluate = useCallback(async (jText: string, tpl: string) => {
    try {
      const input = JSON.parse(jText);
      const expr = jsonata(tpl);
      const res = await expr.evaluate({ input, extra: {} });
      setResult(res === undefined ? "undefined" : JSON.stringify(res, null, 2));
      setError(null);
    } catch (err) {
      setError(String(err));
      setResult("");
    }
  }, []);

  const debouncedEvaluate = useDebounce(evaluate, 300);

  useEffect(() => {
    if (!inputUnlocked) {
      setResult("");
      setError(null);
      return;
    }
    debouncedEvaluate(jsonText, template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonText, template, inputUnlocked]);

  // ── Output validation (debounced)

  const runOutputValidation = useCallback(async (resultText: string, schema: SchemaRef | null, on: boolean) => {
    if (!on || !schema || !resultText || resultText === "undefined") {
      setOutputValidation({ kind: "unchecked" });
      return;
    }
    let metadata: unknown;
    try {
      metadata = JSON.parse(resultText);
    } catch {
      setOutputValidation({ kind: "invalid", errors: [{ message: "Result is not valid JSON" }] });
      return;
    }
    setOutputValidation({ kind: "checking" });
    try {
      const res = await fetch(
        `/validate?input_schema=${encodeURIComponent(schema.name)}&input_version=${encodeURIComponent(schema.version)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata }) }
      );
      const body = await res.json();
      if (res.ok) {
        setOutputValidation({ kind: "valid" });
      } else {
        setOutputValidation({ kind: "invalid", errors: Array.isArray(body.details) ? body.details : [{ message: body.message ?? "Validation failed" }] });
      }
    } catch (err) {
      setOutputValidation({ kind: "invalid", errors: [{ message: `Network error: ${err}` }] });
    }
  }, []);

  const debouncedOutputValidate = useDebounce(runOutputValidation, 400);

  useEffect(() => {
    debouncedOutputValidate(result, outputSchema, validateOutputOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, outputSchema, validateOutputOn]);

  // ── Monaco decorations: highlight additionalProperty tokens in the JSON editor

  useEffect(() => {
    decorationsRef.current?.clear();
    decorationsRef.current = null;
    if (inputValidation.kind !== "invalid" || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    const decos = buildValidationDecorations(inputValidation.errors, model.getValue(), model);
    if (decos.length > 0) decorationsRef.current = editorRef.current.createDecorationsCollection(decos);
  }, [inputValidation]);

  // ── Monaco decorations: highlight validation errors in the result editor

  useEffect(() => {
    resultDecorationsRef.current?.clear();
    resultDecorationsRef.current = null;
    if (outputValidation.kind !== "invalid" || !resultEditorRef.current) return;
    const model = resultEditorRef.current.getModel();
    if (!model) return;
    const decos = buildValidationDecorations(outputValidation.errors, model.getValue(), model);
    if (decos.length > 0) resultDecorationsRef.current = resultEditorRef.current.createDecorationsCollection(decos);
  }, [outputValidation]);

  // ── Errors sub-panel: auto-open on first error, auto-close when cleared

  const prevHasErrors = useRef(false);
  useEffect(() => {
    const hasErrors =
      (inputValidation.kind === "invalid" && !!inputSchema) ||
      (outputValidation.kind === "invalid" && validateOutputOn && inputUnlocked);
    if (hasErrors && !prevHasErrors.current) {
      errorsPanelRef.current?.resize("50%");
    } else if (!hasErrors) {
      errorsPanelRef.current?.collapse();
    }
    prevHasErrors.current = hasErrors;
  }, [inputValidation, outputValidation, validateOutputOn, inputUnlocked, inputSchema]);

  // ── Auto-detect input schema on mount when datasets/templates ready

  const autoDetectedRef = useRef(false);
  useEffect(() => {
    if (autoDetectedRef.current) return;
    if (inputSchema) { autoDetectedRef.current = true; return; }
    if (!jsonText) return;
    autoDetectedRef.current = true;
    (async () => {
      try {
        const parsed = JSON.parse(jsonText);
        const res = await fetch("/find", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        const data = (await res.json()) as FindMatch[];
        const matches = data.filter((d) => d.matches);
        if (matches.length === 1) {
          setInputSchema({ name: matches[0].name, version: matches[0].version });
        }
      } catch { /* ignore */ }
    })();
  }, [jsonText, inputSchema, setInputSchema]);

  // ── Find Schemas dialog

  async function runFind(source: "input" | "result", jsonString: string) {
    setFinding(source);
    setFindSource(source);
    setFindError(null);
    setExpandedRows(new Set());
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

  function pickInputSchema(name: string, version: string) {
    setInputSchema({ name, version });
    setFindResults(null);
  }

  // ── Dataset / template handlers

  async function handleDatasetSelect(opt: DatasetOption | null) {
    if (!opt) return;
    setSelectedDataset({ pid: opt.pid, title: opt.title });
    setLoadingDataset(true);
    try {
      const res = await fetch(`/get/dataset?pid=${encodeURIComponent(opt.pid)}`);
      const data = await res.json();
      const text = JSON.stringify(data, null, 2);
      setJsonText(text);
      loadedDatasetJsonRef.current = text;
      // Reset the auto-detect guard so the new JSON gets schema-detected
      autoDetectedRef.current = false;
    } catch { /* ignore */ } finally {
      setLoadingDataset(false);
    }
  }

  function handleDatasetClear() {
    setSelectedDataset(null);
    loadedDatasetJsonRef.current = null;
    setJsonText(DEFAULT_JSON);
    autoDetectedRef.current = false;
  }

  async function handleTemplateSelect(opt: TemplateOption | null) {
    if (!opt) {
      setSelectedMapping(null);
      setLoadedTemplateText(null);
      return;
    }
    try {
      const res = await fetch(
        `/get/map?input_schema=${encodeURIComponent(opt.input_model)}&input_version=${encodeURIComponent(opt.input_version)}&output_schema=${encodeURIComponent(opt.output_model)}&output_version=${encodeURIComponent(opt.output_version)}`
      );
      const data = await res.json();
      if (data.translation_map) {
        setTemplate(data.translation_map);
        setLoadedTemplateText(data.translation_map);
        setSelectedMapping({ input_model: opt.input_model, input_version: opt.input_version, output_model: opt.output_model, output_version: opt.output_version });
        setValidateOutputOn(true);
      }
    } catch { /* ignore */ }
  }

  function handleBeautify() {
    try {
      setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2));
    } catch {
      setError("Cannot beautify: invalid JSON");
    }
  }

  function handleShare() {
    const params = new URLSearchParams();
    params.set("tpl", btoa(encodeURIComponent(template)));
    if (inputSchema)        params.set("in",  `${inputSchema.name}:${inputSchema.version}`);
    if (customOutputSchema) params.set("out", `${customOutputSchema.name}:${customOutputSchema.version}`);
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Flat list of all schema:version pairs for the custom output picker

  const allSchemaRefs = useMemo(() => {
    const list: Array<{ key: string; name: string; version: string }> = [];
    for (const [name, versions] of Object.entries(schemaList)) {
      for (const version of versions) list.push({ key: `${name}:${version}`, name, version });
    }
    return list;
  }, [schemaList]);

  // ── Theme
  const { palette: { mode: colorMode } } = useTheme();
  const monacoTheme = colorMode === "dark" ? "vs-dark" : "vs";

  // ── Style consts

  const EDITOR_OPTS = { minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: "on" as const };
  const PANEL_HEADER = { display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", flexShrink: 0, minHeight: 36 };

  // ── Render

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)", overflow: "hidden" }}>
      <style>{`
        .traser-error-token { background: rgba(244,67,54,0.18); border-bottom: 2px solid #f44336; }
        .traser-sep-h { background: rgba(255,255,255,0.08); transition: background 0.15s; }
        .traser-sep-h:hover, .traser-sep-h[data-state="drag"] { background: rgba(71,93,167,0.7); }
        .traser-sep-v { background: rgba(255,255,255,0.08); transition: background 0.15s; }
        .traser-sep-v:hover, .traser-sep-v[data-state="drag"] { background: rgba(71,93,167,0.7); }
      `}</style>
      {/* ── Main split layout ── */}
      <Group orientation="horizontal" style={{ flex: 1, overflow: "hidden" }}>

        {/* ── LEFT: JSON input ── */}
        <Panel panelRef={leftPanelRef} id="left-panel" defaultSize={`${hSplit}%`} minSize="10%" collapsible collapsedSize="40px"
          onResize={(size) => { const collapsed = size.inPixels <= 42; setLeftCollapsed(collapsed); if (!collapsed && !rightPanelRef.current?.isCollapsed() && size.asPercentage > 5) setHSplit(size.asPercentage); }}>
          {leftCollapsed ? (
            <Tooltip title="Expand JSON Input" placement="right">
              <Box role="button" tabIndex={0} aria-label="Expand JSON Input panel"
                onClick={() => leftPanelRef.current?.resize(`${hSplit}%`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); leftPanelRef.current?.resize(`${hSplit}%`); } }}
                sx={{
                width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 1.5, cursor: "pointer", bgcolor: "background.paper",
                borderRight: "1px solid", borderColor: "divider", transition: "background 0.15s",
                "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
              }}>
                <ChevronRightIcon sx={{ fontSize: 20, color: "primary.main" }} />
                <Typography variant="caption" sx={{
                  fontFamily: "monospace", fontSize: "0.6rem", color: "text.disabled", letterSpacing: "0.08em",
                  writingMode: "vertical-rl", transform: "rotate(180deg)", userSelect: "none",
                }}>JSON INPUT</Typography>
              </Box>
            </Tooltip>
          ) : (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%", borderRight: "1px solid", borderColor: "divider", overflow: "hidden" }}>
          <Box sx={{ ...PANEL_HEADER }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontFamily: "monospace" }}>
              JSON INPUT
            </Typography>
            <InputBadge
              inputSchema={inputSchema}
              inputValidation={inputValidation}
              finding={finding}
              onFind={() => runFind("input", jsonRef.current)}
              onOpenPicker={() => setSchemaPickerOpen(true)}
            />
            <Chip
              size="small"
              label={
                loadingDataset
                  ? "Loading…"
                  : selectedDataset
                    ? `${selectedDataset.title.length > 20 ? selectedDataset.title.slice(0, 20) + "…" : selectedDataset.title}${datasetMode === "modified" ? " (modified)" : ""}`
                    : "Load dataset…"
              }
              onClick={() => setDatasetOpen(true)}
              onDelete={selectedDataset ? handleDatasetClear : undefined}
              variant={selectedDataset ? "filled" : "outlined"}
              sx={{
                height: 20,
                fontSize: "0.65rem",
                cursor: "pointer",
                ...(selectedDataset
                  ? datasetMode === "modified"
                    ? { bgcolor: "rgba(180,120,0,0.12)", color: "warning.dark" }
                    : { bgcolor: "rgba(71,93,167,0.15)", color: "primary.main" }
                  : { borderColor: "text.disabled", color: "text.secondary" }),
                "& .MuiChip-deleteIcon": { fontSize: 12 },
              }}
            />
            <Box sx={{ flex: 1 }} />
            <Button size="small" startIcon={<AutoFixHighIcon sx={{ fontSize: 14 }} />} onClick={handleBeautify} sx={{ py: 0, fontSize: "0.7rem" }}>
              Beautify
            </Button>
            <Tooltip title="Copy share link (template + schema)">
              <Button size="small" startIcon={<LinkIcon sx={{ fontSize: 14 }} />} onClick={handleShare} sx={{ py: 0, fontSize: "0.7rem", color: copied ? "success.main" : undefined }}>
                {copied ? "Copied!" : "Share"}
              </Button>
            </Tooltip>
            <Tooltip title="Collapse panel">
              <IconButton size="small" onClick={() => leftPanelRef.current?.collapse()} sx={{ ml: 0.5, p: 0.25 }}>
                <ChevronLeftIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* ── Editor + errors as vertical sub-panels ── */}
          <Group orientation="vertical" style={{ flex: 1, overflow: "hidden" }}>
            <Panel panelRef={editorPanelRef} id="editor-panel" defaultSize="100%" minSize="15%">
              {Editor ? (
                <Editor height="100%" language="json" theme={monacoTheme} value={jsonText}
                  onChange={(v) => setJsonText(v ?? "")} options={EDITOR_OPTS}
                  onMount={(ed) => { editorRef.current = ed; }} />
              ) : <EditorSkeleton />}
            </Panel>
            <Separator className="traser-sep-v" style={{ height: 4, cursor: "row-resize" }} />
            <Panel panelRef={errorsPanelRef} id="errors-panel"
                   defaultSize="0%" minSize="15%" collapsible collapsedSize="0px">
              {(() => {
                const showInputErrors = inputValidation.kind === "invalid" && inputSchema;
                const showOutputErrors = outputValidation.kind === "invalid" && validateOutputOn && inputUnlocked;
                if (!showInputErrors && !showOutputErrors) return null;
                const which: "input" | "output" = showOutputErrors ? "output" : "input";
                const errors = which === "output"
                  ? (outputValidation.kind === "invalid" ? outputValidation.errors : [])
                  : (inputValidation.kind === "invalid" ? inputValidation.errors : []);
                const schema = which === "output" ? outputSchema : inputSchema;
                return (
                  <Box sx={{ height: "100%", display: "flex", flexDirection: "column", borderTop: "1px solid rgba(244,67,54,0.3)", bgcolor: "rgba(244,67,54,0.06)" }}>
                    <Box sx={{ ...PANEL_HEADER, bgcolor: "rgba(244,67,54,0.12)", borderBottom: "1px solid rgba(244,67,54,0.2)" }}>
                      <CancelIcon sx={{ color: "error.main", fontSize: 16 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "error.light", fontFamily: "monospace", flex: 1 }}>
                        {which === "output" ? "OUTPUT" : "INPUT"} VALIDATION — {errors.length} error{errors.length === 1 ? "" : "s"}
                        {schema && (
                          <Typography component="span" variant="caption" sx={{ ml: 1, color: "text.secondary", fontWeight: 400 }}>
                            against {schema.name} {schema.version}
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, overflow: "auto", p: 1.25, fontFamily: "monospace", fontSize: "0.72rem", color: "error.main", lineHeight: 1.55 }}>
                      {errors.map((e, i) => {
                        const addProp = e.params?.additionalProperty as string | undefined;
                        const invalidVal = typeof e.invalidValue === "string" ? e.invalidValue : undefined;
                        const valueTag = addProp ?? invalidVal;
                        return (
                          <Box key={i} sx={{ mb: 0.5, display: "flex", gap: 1 }}>
                            <Box sx={{ color: "text.disabled", flexShrink: 0 }}>{i + 1}.</Box>
                            <Box>
                              <Box component="span" sx={{ color: "warning.main" }}>{e.instancePath || "(root)"}</Box>
                              <Box component="span" sx={{ color: "error.main", ml: 1 }}>{e.message ?? "error"}</Box>
                              {valueTag && (
                                <Box component="span" sx={{ color: "warning.light", ml: 1, fontStyle: "italic" }}>("{valueTag}")</Box>
                              )}
                              {(() => {
                                const MAX_SHOWN = 4;
                                if (e.allowedValues && e.allowedValues.length > MAX_SHOWN) {
                                  const isExpanded = expandedSuggestions.has(i);
                                  const shown = isExpanded ? e.allowedValues : e.allowedValues.slice(0, MAX_SHOWN);
                                  const remaining = e.allowedValues.length - MAX_SHOWN;
                                  return (
                                    <Box component="span" sx={{ color: "text.secondary", ml: 1 }}>
                                      → Allowed: {shown.map(v => JSON.stringify(v)).join(", ")}
                                      {!isExpanded && (
                                        <Box component="span"
                                          onClick={() => setExpandedSuggestions(prev => { const next = new Set(prev); next.add(i); return next; })}
                                          sx={{ color: "primary.main", cursor: "pointer", ml: 0.5, textDecoration: "underline" }}>
                                          (+{remaining} more)
                                        </Box>
                                      )}
                                    </Box>
                                  );
                                }
                                return e.suggestion ? (
                                  <Box component="span" sx={{ color: "text.secondary", ml: 1 }}>{`→ ${e.suggestion}`}</Box>
                                ) : null;
                              })()}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                );
              })()}
            </Panel>
          </Group>
          </Box>
          )}
        </Panel>

        {/* ── Horizontal resize handle ── */}
        <Separator className="traser-sep-h" style={{ width: 4, cursor: "col-resize" }} />

        {/* ── RIGHT: template + result ── */}
        <Panel panelRef={rightPanelRef} id="right-panel" defaultSize={`${100 - hSplit}%`} minSize="10%"
          collapsible collapsedSize="40px"
          onResize={(size) => { const collapsed = size.inPixels <= 42; setRightCollapsed(collapsed); }}>
        {rightCollapsed ? (
          <Tooltip title="Expand right panels" placement="left">
            <Box role="button" tabIndex={0} aria-label="Expand template and result panels"
              onClick={() => rightPanelRef.current?.resize(`${100 - hSplit}%`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); rightPanelRef.current?.resize(`${100 - hSplit}%`); } }}
              sx={{
              width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 1.5, cursor: "pointer", bgcolor: "background.paper",
              borderLeft: "1px solid", borderColor: "divider", transition: "background 0.15s",
              "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
            }}>
              <ChevronLeftIcon sx={{ fontSize: 20, color: "primary.main" }} />
              <Typography variant="caption" sx={{
                fontFamily: "monospace", fontSize: "0.6rem", color: "text.disabled", letterSpacing: "0.08em",
                writingMode: "vertical-rl", transform: "rotate(180deg)", userSelect: "none",
              }}>TEMPLATE / RESULT</Typography>
            </Box>
          </Tooltip>
        ) : (
        <Group orientation="vertical" style={{ height: "100%" }}>

          {/* ── Top right: JSONata template ── */}
          <Panel panelRef={templatePanelRef} id="template-panel" defaultSize={`${vSplit}%`} minSize="10%" collapsible collapsedSize="40px"
            onResize={(size) => { const collapsed = size.inPixels <= 42; setTemplateCollapsed(collapsed); if (!collapsed && !resultPanelRef.current?.isCollapsed() && size.asPercentage > 5) setVSplit(size.asPercentage); }}>
          {templateCollapsed ? (
            <Tooltip title="Expand Template" placement="bottom">
              <Box role="button" tabIndex={0} aria-label="Expand JSONata template panel"
                onClick={() => templatePanelRef.current?.resize(`${vSplit}%`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); templatePanelRef.current?.resize(`${vSplit}%`); } }}
                sx={{
                width: "100%", height: "100%", display: "flex", flexDirection: "row", alignItems: "center",
                justifyContent: "center", gap: 1, cursor: "pointer", bgcolor: "background.paper",
                borderBottom: "1px solid", borderColor: "divider", transition: "background 0.15s",
                "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
              }}>
                <ExpandMoreIcon sx={{ fontSize: 18, color: "primary.main" }} />
                <Typography variant="caption" sx={{ fontFamily: "monospace", fontSize: "0.6rem", color: "text.disabled", letterSpacing: "0.08em", userSelect: "none" }}>
                  JSONATA TEMPLATE
                </Typography>
              </Box>
            </Tooltip>
          ) : (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%", borderBottom: "1px solid", borderColor: "divider", overflow: "hidden" }}>
            <Box sx={{ ...PANEL_HEADER }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontFamily: "monospace" }}>
                JSONATA TEMPLATE
              </Typography>
              {inputUnlocked && (
                mappingMode === "known" && selectedMapping ? (
                  <Chip size="small"
                    label={`${selectedMapping.input_model} ${selectedMapping.input_version} → ${selectedMapping.output_model} ${selectedMapping.output_version}`}
                    onClick={() => setMappingOpen(true)}
                    sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer", bgcolor: "rgba(71,93,167,0.25)", color: "primary.light" }} />
                ) : (
                  <Chip size="small"
                    label={selectedMapping ? "Custom (modified)" : "Load mapping…"}
                    onClick={() => setMappingOpen(true)}
                    variant={!selectedMapping ? "outlined" : "filled"}
                    sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer", ...(selectedMapping ? { bgcolor: "rgba(255,193,7,0.18)", color: "warning.light" } : { borderColor: "text.disabled", color: "text.secondary" }) }} />
                )
              )}
              <Box sx={{ flex: 1 }} />
              <Tooltip title={resultCollapsed ? "Expand result panel first" : "Collapse panel"}>
                <span>
                  <IconButton size="small" onClick={() => templatePanelRef.current?.collapse()} disabled={resultCollapsed} sx={{ p: 0.25 }}>
                    <ExpandLessIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Collapse right side">
                <IconButton size="small" onClick={() => rightPanelRef.current?.collapse()} sx={{ p: 0.25 }}>
                  <ChevronRightIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ flex: 1, overflow: "hidden" }}>
              {!inputUnlocked ? (
                <LockedPanel
                  message="The JSON input must validate against a known schema before you can edit a template. Use Find Schemas to identify the input."
                  onAction={() => runFind("input", jsonRef.current)}
                  actionLabel="Find Schemas"
                />
              ) : Editor ? (
                <Editor height="100%" language="javascript" theme={monacoTheme} value={template}
                  onChange={(v) => setTemplate(v ?? "")}
                  options={{ ...EDITOR_OPTS, "semanticHighlighting.enabled": false }}
                  beforeMount={(monaco) => {
                    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                      noSemanticValidation: true, noSyntaxValidation: true,
                    });
                  }}
                />
              ) : <EditorSkeleton />}
            </Box>
          </Box>
          )}
          </Panel>

          {/* ── Vertical resize handle ── */}
          <Separator className="traser-sep-v" style={{ height: 4, cursor: "row-resize" }} />

          {/* ── Bottom right: result ── */}
          <Panel panelRef={resultPanelRef} id="result-panel" defaultSize={`${100 - vSplit}%`} minSize="10%" collapsible collapsedSize="40px"
            onResize={(size) => { const collapsed = size.inPixels <= 42; setResultCollapsed(collapsed); }}>
          {resultCollapsed ? (
            <Tooltip title="Expand Result" placement="top">
              <Box role="button" tabIndex={0} aria-label="Expand result panel"
                onClick={() => resultPanelRef.current?.resize(`${100 - vSplit}%`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); resultPanelRef.current?.resize(`${100 - vSplit}%`); } }}
                sx={{
                width: "100%", height: "100%", display: "flex", flexDirection: "row", alignItems: "center",
                justifyContent: "center", gap: 1, cursor: "pointer", bgcolor: "background.paper",
                transition: "background 0.15s", "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
              }}>
                <ExpandLessIcon sx={{ fontSize: 18, color: "primary.main" }} />
                <Typography variant="caption" sx={{ fontFamily: "monospace", fontSize: "0.6rem", color: "text.disabled", letterSpacing: "0.08em", userSelect: "none" }}>
                  {error ? "ERROR" : "RESULT"}
                </Typography>
              </Box>
            </Tooltip>
          ) : (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <Box sx={{ ...PANEL_HEADER }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: error ? "error.main" : "text.secondary", fontFamily: "monospace" }}>
                {error ? "ERROR" : "RESULT"}
              </Typography>
              {inputUnlocked && !error && (
                <OutputBadge
                  outputSchema={outputSchema}
                  validateOutputOn={validateOutputOn}
                  outputValidation={outputValidation}
                />
              )}
{inputUnlocked && error && <Chip label="JSONata Error" size="small" color="error" />}
              {inputUnlocked && !error && result && <Chip label="Translated" size="small" color="success" />}
              <Box sx={{ flex: 1 }} />
              {inputUnlocked && !error && (
                <>
                  {/* Custom-mode: pick an output schema target */}
                  {mappingMode === "custom" && (
                    <FormControl size="small" sx={{ minWidth: 170 }}>
                      <InputLabel sx={{ fontSize: "0.7rem" }}>Validate against</InputLabel>
                      <Select
                        label="Validate against"
                        value={customOutputSchema ? `${customOutputSchema.name}:${customOutputSchema.version}` : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) { setCustomOutputSchema(null); setValidateOutputOn(false); }
                          else {
                            const [name, ...rest] = v.split(":");
                            setCustomOutputSchema({ name, version: rest.join(":") });
                            setValidateOutputOn(true);
                          }
                        }}
                        sx={{ fontSize: "0.7rem", height: 24 }}
                      >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {allSchemaRefs.map((s) => (
                          <MenuItem key={s.key} value={s.key} sx={{ fontSize: "0.75rem" }}>
                            {s.name} {s.version}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  {/* Toggle (only meaningful if there is an output schema) */}
                  {outputSchema && (
                    <Tooltip title={validateOutputOn ? "Output validation enabled" : "Output validation disabled"}>
                      <Box sx={{ display: "flex", alignItems: "center" }}>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.65rem", mr: 0.5 }}>Validate</Typography>
                        <Switch size="small" checked={validateOutputOn} onChange={(_, c) => setValidateOutputOn(c)} />
                      </Box>
                    </Tooltip>
                  )}
                  {result && (
                    <Button size="small" startIcon={<FindInPageIcon sx={{ fontSize: 14 }} />}
                      onClick={() => runFind("result", result)} disabled={finding === "result"}
                      sx={{ py: 0, fontSize: "0.7rem" }}>
                      {finding === "result" ? "Finding…" : "Find Schemas"}
                    </Button>
                  )}
                </>
              )}
              <Tooltip title={templateCollapsed ? "Expand template panel first" : "Collapse panel"}>
                <span>
                  <IconButton size="small" onClick={() => resultPanelRef.current?.collapse()} disabled={templateCollapsed} sx={{ p: 0.25, ml: 0.5 }}>
                    <ExpandMoreIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            <Box sx={{ flex: 1, overflow: "hidden", position: "relative" }}>
              {!inputUnlocked ? (
                <LockedPanel message="Result will appear here once the JSON input is valid against a schema." />
              ) : error ? (
                <Box sx={{ p: 2, fontFamily: "monospace", fontSize: "0.78rem", color: "error.main", whiteSpace: "pre-wrap", overflow: "auto", height: "100%" }}>
                  {error}
                </Box>
              ) : Editor ? (
                <Editor height="100%" language="json" theme={monacoTheme} value={result}
                  options={{ ...EDITOR_OPTS, readOnly: true, hover: { enabled: true } }}
                  onMount={(ed) => { resultEditorRef.current = ed; }} />
              ) : <EditorSkeleton />}
            </Box>
          </Box>
          )}
          </Panel>

        </Group>
        )}
        </Panel>
      </Group>

      {/* ── Dataset picker dialog ── */}
      <Dialog open={datasetOpen} onClose={() => { setDatasetOpen(false); setDatasetFilter(""); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1, py: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Load dataset</Typography>
            <Typography variant="caption" color="text.secondary">
              {datasets.length > 0 ? `${datasets.length} datasets available` : "Loading…"}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => { setDatasetOpen(false); setDatasetFilter(""); }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Box sx={{ px: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <TextField
            fullWidth size="small" autoFocus
            placeholder="Search datasets…"
            value={datasetFilter}
            onChange={(e) => setDatasetFilter(e.target.value)}
          />
        </Box>
        <DialogContent sx={{ p: 0, maxHeight: 400, overflowY: "auto" }}>
          {(() => {
            const filtered = datasets.filter(d => d.title.toLowerCase().includes(datasetFilter.toLowerCase()));
            if (filtered.length === 0) return (
              <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
                <Typography variant="body2">No datasets match "{datasetFilter}"</Typography>
              </Box>
            );
            return (
              <List dense disablePadding>
                {filtered.map((d) => (
                  <ListItem key={d.pid} disablePadding divider>
                    <ListItemButton
                      selected={selectedDataset?.pid === d.pid}
                      onClick={() => { handleDatasetSelect(d); setDatasetOpen(false); setDatasetFilter(""); }}
                      sx={{ py: 1, px: 2 }}
                    >
                      <ListItemText
                        primary={d.title}
                        slotProps={{ primary: { variant: "body2", sx: { fontWeight: selectedDataset?.pid === d.pid ? 700 : 400 } } }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Mapping picker dialog ── */}
      <Dialog open={mappingOpen} onClose={() => { setMappingOpen(false); setMappingFilter(""); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1, py: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Load mapping</Typography>
            <Typography variant="caption" color="text.secondary">
              {inputSchema
                ? `${availableTemplates.length} mapping${availableTemplates.length === 1 ? "" : "s"} for ${inputSchema.name} ${inputSchema.version}`
                : "Select an input schema first"}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => { setMappingOpen(false); setMappingFilter(""); }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Box sx={{ px: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <TextField
            fullWidth size="small" autoFocus
            placeholder="Filter mappings…"
            value={mappingFilter}
            onChange={(e) => setMappingFilter(e.target.value)}
          />
        </Box>
        <DialogContent sx={{ p: 0, maxHeight: 400, overflowY: "auto" }}>
          {(() => {
            const label = (t: TemplateOption) => `${t.input_model} ${t.input_version} → ${t.output_model} ${t.output_version}`;
            const filtered = availableTemplates.filter(t => label(t).toLowerCase().includes(mappingFilter.toLowerCase()));
            if (availableTemplates.length === 0) return (
              <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
                <Typography variant="body2">{inputSchema ? "No mappings available for this schema." : "Detect the input schema first."}</Typography>
              </Box>
            );
            if (filtered.length === 0) return (
              <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
                <Typography variant="body2">No mappings match "{mappingFilter}"</Typography>
              </Box>
            );
            return (
              <List dense disablePadding>
                {filtered.map((t) => {
                  const key = `${t.input_model}:${t.input_version}:${t.output_model}:${t.output_version}`;
                  const isSelected = selectedMapping?.input_model === t.input_model && selectedMapping?.input_version === t.input_version && selectedMapping?.output_model === t.output_model && selectedMapping?.output_version === t.output_version;
                  return (
                    <ListItem key={key} disablePadding divider>
                      <ListItemButton
                        selected={isSelected}
                        onClick={() => { handleTemplateSelect(t); setMappingOpen(false); setMappingFilter(""); }}
                        sx={{ py: 1, px: 2 }}
                      >
                        <ListItemText
                          primary={label(t)}
                          slotProps={{ primary: { variant: "body2", sx: { fontWeight: isSelected ? 700 : 400, fontFamily: "monospace", fontSize: "0.85rem" } } }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Input schema picker dialog ── */}
      <Dialog open={schemaPickerOpen} onClose={() => { setSchemaPickerOpen(false); setSchemaPickerFilter(""); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1, py: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Select input schema</Typography>
            <Typography variant="caption" color="text.secondary">
              {allSchemaRefs.length} schemas available
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => { setSchemaPickerOpen(false); setSchemaPickerFilter(""); }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Box sx={{ px: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <TextField
            fullWidth size="small" autoFocus
            placeholder="Filter schemas…"
            value={schemaPickerFilter}
            onChange={(e) => setSchemaPickerFilter(e.target.value)}
          />
        </Box>
        <DialogContent sx={{ p: 0, maxHeight: 400, overflowY: "auto" }}>
          {(() => {
            const filtered = allSchemaRefs.filter(s =>
              `${s.name} ${s.version}`.toLowerCase().includes(schemaPickerFilter.toLowerCase())
            );
            if (filtered.length === 0) return (
              <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
                <Typography variant="body2">No schemas match "{schemaPickerFilter}"</Typography>
              </Box>
            );
            return (
              <List dense disablePadding>
                {filtered.map((s) => (
                  <ListItem key={s.key} disablePadding divider>
                    <ListItemButton
                      selected={inputSchema?.name === s.name && inputSchema?.version === s.version}
                      onClick={() => {
                        setInputSchema({ name: s.name, version: s.version });
                        setSchemaPickerOpen(false);
                        setSchemaPickerFilter("");
                      }}
                      sx={{ py: 1, px: 2 }}
                    >
                      <ListItemText
                        primary={`${s.name} ${s.version}`}
                        slotProps={{ primary: { variant: "body2", sx: { fontFamily: "monospace", fontSize: "0.85rem", fontWeight: inputSchema?.name === s.name && inputSchema?.version === s.version ? 700 : 400 } } }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Find Schemas dialog ── */}
      <Dialog open={findResults !== null} onClose={() => setFindResults(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1, py: 1.5 }}>
          <FindInPageIcon fontSize="small" sx={{ color: "primary.main" }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              Schema match results
              {findSource && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
                  — {findSource === "input" ? "JSON input" : "translation result"}
                </Typography>
              )}
            </Typography>
            {findResults && (
              <Typography variant="caption" color="text.secondary">
                {findResults.filter(r => r.matches).length} of {findResults.length} matched
                {findSource === "input" && " — click \"Use this\" to set the schema"}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={() => setFindResults(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          {findError && (
            <Box sx={{ p: 1.5, color: "error.main", fontFamily: "monospace", fontSize: "0.78rem" }}>{findError}</Box>
          )}

          {findResults && findResults.length > 0 && (
            <>
              <Table size="small" sx={{
                "& th": { fontWeight: 700, bgcolor: "background.paper", fontSize: "0.72rem" },
                "& td, & th": { py: 0.5, px: 1.25 },
              }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 32, px: "6px !important" }}></TableCell>
                    <TableCell>Schema</TableCell>
                    <TableCell>Version</TableCell>
                    <TableCell align="right">Status</TableCell>
                    {findSource === "input" && <TableCell sx={{ width: 86 }}></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {findResults.map((r) => {
                    const rowKey = `${r.name}:${r.version}`;
                    const hasErrors = !r.matches && (r.errors?.length ?? 0) > 0;
                    const isExpanded = expandedRows.has(rowKey);
                    const colSpan = findSource === "input" ? 5 : 4;
                    return (
                      <Fragment key={rowKey}>
                        <TableRow hover>
                          <TableCell sx={{ px: "6px !important" }}>
                            {r.matches
                              ? <CheckCircleIcon sx={{ color: "success.main", fontSize: 16, display: "block" }} />
                              : <CancelIcon sx={{ color: "error.main", fontSize: 16, display: "block" }} />}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: "0.8rem" }}>{r.name}</TableCell>
                          <TableCell sx={{ color: "text.secondary", fontSize: "0.8rem" }}>{r.version}</TableCell>
                          <TableCell align="right">
                            {r.matches ? (
                              <Typography variant="caption" color="success.main">matches</Typography>
                            ) : hasErrors ? (
                              <Button
                                size="small"
                                endIcon={<ExpandMoreIcon sx={{ fontSize: "12px !important", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />}
                                onClick={() => setExpandedRows(prev => {
                                  const next = new Set(prev);
                                  next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
                                  return next;
                                })}
                                sx={{ py: 0, px: 0.5, fontSize: "0.68rem", color: "error.main", minWidth: 0 }}
                              >
                                {r.errors!.length} error{r.errors!.length === 1 ? "" : "s"}
                              </Button>
                            ) : (
                              <Typography variant="caption" color="text.secondary">0 errors</Typography>
                            )}
                          </TableCell>
                          {findSource === "input" && (
                            <TableCell sx={{ textAlign: "right" }}>
                              {r.matches && (
                                <Button size="small" variant={inputSchema?.name === r.name && inputSchema?.version === r.version ? "contained" : "outlined"}
                                  onClick={() => pickInputSchema(r.name, r.version)}
                                  sx={{ py: 0, px: 1, fontSize: "0.68rem", minWidth: 0 }}>
                                  {inputSchema?.name === r.name && inputSchema?.version === r.version ? "✓ Set" : "Use"}
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                        {hasErrors && (
                          <TableRow>
                            <TableCell colSpan={colSpan} sx={{ p: 0, border: isExpanded ? undefined : 0 }}>
                              <Collapse in={isExpanded} unmountOnExit>
                                <Box component="pre" sx={{ m: 0, px: 2, py: 1.25, bgcolor: "rgba(244,67,54,0.06)", borderTop: "1px solid rgba(244,67,54,0.2)", fontFamily: "monospace", fontSize: "0.72rem", color: "error.light", lineHeight: 1.6, overflow: "auto", maxHeight: 200 }}>
                                  {(r.errors ?? []).map((e, i) =>
                                    `${i + 1}. ${e.instancePath || "(root)"}: ${e.message ?? "error"}${e.params ? ` ${JSON.stringify(e.params)}` : ""}`
                                  ).join("\n")}
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
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
