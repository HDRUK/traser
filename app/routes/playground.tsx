import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import LinkIcon from "@mui/icons-material/Link";
import type { EditorProps } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import jsonata from "jsonata";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { Button, IconButton } from "@hdruk/ui";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { playgroundStore, type SchemaRef } from "../stores/playgroundStore";
import { DEFAULT_JSON } from "../config/playgroundDefaults";
import { getDatasetIndex } from "~/lib/cache.server";
import { getAvailableTemplates } from "~/lib/templates.server";
import { ensureLoaded, getAvailableSchemas } from "~/lib/schema.server";
import { MAX_SHARED_TEMPLATE_CHARS, type DatasetOption, type TemplateOption, type FindMatch, type ValidationState } from "~/lib/playground/types";
import { useDebounce } from "~/lib/playground/useDebounce";
import { buildValidationDecorations } from "~/lib/playground/monacoDecorations";
import { EditorSkeleton } from "~/components/playground/EditorSkeleton";
import { LockedPanel } from "~/components/playground/LockedPanel";
import { InputBadge } from "~/components/playground/InputBadge";
import { OutputBadge } from "~/components/playground/OutputBadge";
import { DatasetPickerDialog } from "~/components/playground/DatasetPickerDialog";
import { MappingPickerDialog } from "~/components/playground/MappingPickerDialog";
import { SchemaPickerDialog } from "~/components/playground/SchemaPickerDialog";
import { FindResultsDialog } from "~/components/playground/FindResultsDialog";
import { CollapsedPanelHandle } from "~/components/playground/CollapsedPanelHandle";
import { ValidationErrorPanel } from "~/components/playground/ValidationErrorPanel";
import { DatasetChip } from "~/components/playground/DatasetChip";
import { MappingChip } from "~/components/playground/MappingChip";
import { ResultPanelActions } from "~/components/playground/ResultPanelActions";
import { PanelSeparatorStyles } from "~/components/playground/PanelSeparatorStyles";
import { EDITOR_OPTS, PANEL_HEADER_SX } from "~/lib/playground/editorConstants";

// ─── Loader ─────────────────────────────────────────────────────────────────

// Reference data (datasets / templates / schemas) is loaded here — in parallel
// with the page — rather than via three client-side fetches after hydration.
// Each source degrades to empty on failure so a reference-data hiccup never
// blanks the whole playground.
export async function loader() {
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

  // onResize fires on every drag tick, not just at drag end. Feeding that
  // straight into hSplit/vSplit re-renders the same Panel's defaultSize prop
  // mid-drag, which fights the library's own live drag tracking and damps
  // the resize to a fraction of the actual pointer movement. Debouncing so
  // the write only lands once movement pauses keeps defaultSize stable for
  // the whole gesture.
  const debouncedSetHSplit = useDebounce(setHSplit, 150);
  const debouncedSetVSplit = useDebounce(setVSplit, 150);

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
    Promise.all([import("@monaco-editor/react"), import("monaco-editor")]).then(
      ([{ default: ReactEditor, loader }, monaco]) => {
        loader.config({ monaco });
        setEditor(() => ReactEditor);
      },
    );
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
  const theme = useTheme();
  const monacoTheme = "vs";

  // ── Render

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)", overflow: "hidden" }}>
      <PanelSeparatorStyles theme={theme} />
      {/* ── Main split layout ── */}
      <Group orientation="horizontal" style={{ flex: 1, overflow: "hidden" }}>

        {/* ── LEFT: JSON input ── */}
        <Panel panelRef={leftPanelRef} id="left-panel" defaultSize={`${hSplit}%`} minSize="10%" collapsible collapsedSize="40px"
          onResize={(size) => { const collapsed = size.inPixels <= 42; setLeftCollapsed(collapsed); if (!collapsed && !rightPanelRef.current?.isCollapsed() && size.asPercentage > 5) debouncedSetHSplit(size.asPercentage); }}>
          {leftCollapsed ? (
            <CollapsedPanelHandle
              orientation="vertical" borderSide="right"
              icon={<ChevronRightIcon sx={{ fontSize: 20, color: "primary.main" }} />}
              label="JSON INPUT" ariaLabel="Expand JSON Input panel"
              tooltip="Expand JSON Input" tooltipPlacement="right"
              onClick={() => leftPanelRef.current?.resize(`${hSplit}%`)}
            />
          ) : (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%", borderRight: "1px solid", borderColor: "divider", overflow: "hidden" }}>
          <Box sx={{ ...PANEL_HEADER_SX }}>
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
            <DatasetChip
              loadingDataset={loadingDataset}
              selectedDataset={selectedDataset}
              datasetMode={datasetMode}
              onClick={() => setDatasetOpen(true)}
              onDelete={handleDatasetClear}
            />
            <Box sx={{ flex: 1 }} />
            <Button variant="text" size="small" startIcon={<AutoFixHighIcon sx={{ fontSize: 14 }} />} onClick={handleBeautify} sx={{ py: 0, fontSize: "0.8rem" }}>
              Beautify
            </Button>
            <Tooltip title="Copy share link (template + schema)">
              <Button variant="text" size="small" startIcon={<LinkIcon sx={{ fontSize: 14 }} />} onClick={handleShare} sx={{ py: 0, fontSize: "0.8rem", color: copied ? "success.main" : undefined }}>
                {copied ? "Copied!" : "Share"}
              </Button>
            </Tooltip>
            <Tooltip title="Collapse panel">
              <IconButton size="small" aria-label="Collapse JSON input panel" onClick={() => leftPanelRef.current?.collapse()} sx={{ ml: 0.5, p: 0.25 }}>
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
                  <ValidationErrorPanel
                    which={which}
                    errors={errors}
                    schema={schema}
                    expandedSuggestions={expandedSuggestions}
                    setExpandedSuggestions={setExpandedSuggestions}
                  />
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
          <CollapsedPanelHandle
            orientation="vertical" borderSide="left"
            icon={<ChevronLeftIcon sx={{ fontSize: 20, color: "primary.main" }} />}
            label="TEMPLATE / RESULT" ariaLabel="Expand template and result panels"
            tooltip="Expand right panels" tooltipPlacement="left"
            onClick={() => rightPanelRef.current?.resize(`${100 - hSplit}%`)}
          />
        ) : (
        <Group orientation="vertical" style={{ height: "100%" }}>

          {/* ── Top right: JSONata template ── */}
          <Panel panelRef={templatePanelRef} id="template-panel" defaultSize={`${vSplit}%`} minSize="10%" collapsible collapsedSize="40px"
            onResize={(size) => { const collapsed = size.inPixels <= 42; setTemplateCollapsed(collapsed); if (!collapsed && !resultPanelRef.current?.isCollapsed() && size.asPercentage > 5) debouncedSetVSplit(size.asPercentage); }}>
          {templateCollapsed ? (
            <CollapsedPanelHandle
              orientation="horizontal" borderSide="bottom"
              icon={<ExpandMoreIcon sx={{ fontSize: 18, color: "primary.main" }} />}
              label="JSONATA TEMPLATE" ariaLabel="Expand JSONata template panel"
              tooltip="Expand Template" tooltipPlacement="bottom"
              onClick={() => templatePanelRef.current?.resize(`${vSplit}%`)}
            />
          ) : (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%", borderBottom: "1px solid", borderColor: "divider", overflow: "hidden" }}>
            <Box sx={{ ...PANEL_HEADER_SX }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontFamily: "monospace" }}>
                JSONATA TEMPLATE
              </Typography>
              {inputUnlocked && (
                <MappingChip
                  mappingMode={mappingMode}
                  selectedMapping={selectedMapping}
                  onClick={() => setMappingOpen(true)}
                />
              )}
              <Box sx={{ flex: 1 }} />
              <Tooltip title={resultCollapsed ? "Expand result panel first" : "Collapse panel"}>
                <span>
                  <IconButton size="small" aria-label="Collapse template panel" onClick={() => templatePanelRef.current?.collapse()} disabled={resultCollapsed} sx={{ p: 0.25 }}>
                    <ExpandLessIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Collapse right side">
                <IconButton size="small" aria-label="Collapse right side" onClick={() => rightPanelRef.current?.collapse()} sx={{ p: 0.25 }}>
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
                    monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
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
            <CollapsedPanelHandle
              orientation="horizontal"
              icon={<ExpandLessIcon sx={{ fontSize: 18, color: "primary.main" }} />}
              label={error ? "ERROR" : "RESULT"} ariaLabel="Expand result panel"
              tooltip="Expand Result" tooltipPlacement="top"
              onClick={() => resultPanelRef.current?.resize(`${100 - vSplit}%`)}
            />
          ) : (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <Box sx={{ ...PANEL_HEADER_SX }}>
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
                <ResultPanelActions
                  mappingMode={mappingMode}
                  customOutputSchema={customOutputSchema}
                  setCustomOutputSchema={setCustomOutputSchema}
                  setValidateOutputOn={setValidateOutputOn}
                  allSchemaRefs={allSchemaRefs}
                  outputSchema={outputSchema}
                  validateOutputOn={validateOutputOn}
                  result={result}
                  finding={finding}
                  onFindResult={() => runFind("result", result)}
                />
              )}
              <Tooltip title={templateCollapsed ? "Expand template panel first" : "Collapse panel"}>
                <span>
                  <IconButton size="small" aria-label="Collapse result panel" onClick={() => resultPanelRef.current?.collapse()} disabled={templateCollapsed} sx={{ p: 0.25, ml: 0.5 }}>
                    <ExpandMoreIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            <Box sx={{ flex: 1, overflow: "hidden", position: "relative" }}>
              {!inputUnlocked ? (
                <LockedPanel message="Result will appear here once the JSON input is valid against a schema." />
              ) : error ? (
                <Box sx={{ p: 2, fontFamily: "monospace", fontSize: "0.85rem", color: "error.main", whiteSpace: "pre-wrap", overflow: "auto", height: "100%" }}>
                  {error}
                </Box>
              ) : Editor ? (
                <Editor height="100%" language="json" theme={monacoTheme} value={result}
                  options={{ ...EDITOR_OPTS, readOnly: true, hover: { enabled: "on" } }}
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

      <DatasetPickerDialog
        open={datasetOpen}
        onClose={() => { setDatasetOpen(false); setDatasetFilter(""); }}
        datasets={datasets}
        datasetFilter={datasetFilter}
        onFilterChange={setDatasetFilter}
        selectedDataset={selectedDataset}
        onSelect={(d) => { handleDatasetSelect(d); setDatasetOpen(false); setDatasetFilter(""); }}
      />

      {/* ── Mapping picker dialog ── */}
      <MappingPickerDialog
        open={mappingOpen}
        onClose={() => { setMappingOpen(false); setMappingFilter(""); }}
        inputSchema={inputSchema}
        availableTemplates={availableTemplates}
        mappingFilter={mappingFilter}
        onFilterChange={setMappingFilter}
        selectedMapping={selectedMapping}
        onSelect={(t) => { handleTemplateSelect(t); setMappingOpen(false); setMappingFilter(""); }}
      />

      {/* ── Input schema picker dialog ── */}
      <SchemaPickerDialog
        open={schemaPickerOpen}
        onClose={() => { setSchemaPickerOpen(false); setSchemaPickerFilter(""); }}
        allSchemaRefs={allSchemaRefs}
        schemaPickerFilter={schemaPickerFilter}
        onFilterChange={setSchemaPickerFilter}
        inputSchema={inputSchema}
        onSelect={(s) => {
          setInputSchema({ name: s.name, version: s.version });
          setSchemaPickerOpen(false);
          setSchemaPickerFilter("");
        }}
      />

      {/* ── Find Schemas dialog ── */}
      <FindResultsDialog
        findResults={findResults}
        findSource={findSource}
        findError={findError}
        expandedRows={expandedRows}
        setExpandedRows={setExpandedRows}
        inputSchema={inputSchema}
        onPickInputSchema={pickInputSchema}
        onClose={() => setFindResults(null)}
      />
    </Box>
  );
}
