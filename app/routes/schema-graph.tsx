import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Button } from "@hdruk/ui";
import DownloadIcon from "@mui/icons-material/Download";

import type { Route } from "./+types/schema-graph";
import { ensureLoaded, getAvailableSchemas } from "~/lib/schema.server";
import {
  getAvailableTemplates,
  type TemplateEntry,
} from "~/lib/templates.server";
import { TranslationGraph } from "~/lib/graph.server";
import { requireAuth } from "~/lib/auth.server";
import { buildFullGraph, buildPathsGraph } from "~/lib/schema-graph/mermaidBuilders";
import { useMermaidSvg } from "~/lib/schema-graph/useMermaidSvg";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

// ─── Loader ───────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  await ensureLoaded();

  const url = new URL(request.url);
  const schema = url.searchParams.get("schema");
  const version = url.searchParams.get("version");

  const [schemas, templates] = await Promise.all([
    getAvailableSchemas().catch(() => ({}) as Record<string, string[]>),
    getAvailableTemplates().catch(() => [] as TemplateEntry[]),
  ]);

  let translations: string[] | null = null;
  if (schema && version) {
    try {
      const startNode = `${schema}:${version}`;
      const allNodes: string[] = [];
      for (const [s, versions] of Object.entries(schemas)) {
        for (const v of versions) allNodes.push(`${s}:${v}`);
      }
      const graph = await TranslationGraph.create();
      const predecessors = graph.dijkstra(startNode);
      translations = allNodes
        .map((endNode) => {
          const { translationsToApply } = graph.getPath(
            startNode,
            endNode,
            predecessors,
          );
          if (!translationsToApply) return null;
          return translationsToApply
            .map((e) => `${e.name}:${e.version}`)
            .join(" -> ");
        })
        .filter((r): r is string => r !== null);
    } catch (err) {
      console.warn("Failed to compute translations:", err);
    }
  }

  return { schemas, templates, translations, schema, version };
}

export function meta() {
  return [{ title: "Translation Graph — TRASER" }];
}

// ─── Page ─────────────────────────────────────────────────────────────────

type ViewMode = "full" | "paths";

export default function SchemaGraphPage() {
  const { schemas, templates, translations, schema, version } =
    useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const [mode, setMode] = useState<ViewMode>(
    schema && version ? "paths" : "full",
  );

  // Build flat list of all schema:version options for the dropdown
  const schemaOptions: Array<{
    schema: string;
    version: string;
    label: string;
  }> = [];
  for (const [s, versions] of Object.entries(schemas)) {
    for (const v of versions) {
      schemaOptions.push({ schema: s, version: v, label: `${s} ${v}` });
    }
  }

  const selectedKey = schema && version ? `${schema}:${version}` : "";

  function handleSchemaChange(value: string) {
    const [s, v] = value.split(":");
    if (s && v)
      navigate(
        `/schema-graph?schema=${encodeURIComponent(s)}&version=${encodeURIComponent(v)}`,
      );
  }

  // Build Mermaid code
  let mermaidCode = "";
  if (mode === "full") {
    mermaidCode = buildFullGraph(templates);
  } else if (mode === "paths" && translations && schema && version) {
    mermaidCode = buildPathsGraph(translations, schema, version);
  }

  const { svg, error, loading } = useMermaidSvg(mermaidCode);

  function handleDownload() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      mode === "full"
        ? "traser-full-graph.svg"
        : `traser-${schema}-${version}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
          Translation Graph
        </Typography>

        <Tooltip title="Download SVG">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={!svg}
            >
              Download SVG
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Controls */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          mb: 3,
          flexWrap: "wrap",
        }}
      >
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, v: ViewMode | null) => v && setMode(v)}
          size="small"
        >
          <ToggleButton value="full">Full Graph</ToggleButton>
          <ToggleButton value="paths">Paths from schema</ToggleButton>
        </ToggleButtonGroup>

        {mode === "paths" && (
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Source schema</InputLabel>
            <Select
              label="Source schema"
              value={selectedKey}
              onChange={(e) => handleSchemaChange(e.target.value)}
            >
              {schemaOptions.map(({ schema: s, version: v, label }) => (
                <MenuItem key={`${s}:${v}`} value={`${s}:${v}`}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {/* Diagram */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          minHeight: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.paper",
          "& svg": { width: "100%", height: "auto" },
        }}
      >
        {loading && <CircularProgress />}

        {!loading && error && (
          <Typography
            color="error"
            variant="body2"
            sx={{ fontFamily: "monospace" }}
          >
            Diagram error: {error}
          </Typography>
        )}

        {!loading && !error && !svg && mode === "paths" && !selectedKey && (
          <Typography color="text.secondary">
            Select a source schema to see its translation paths.
          </Typography>
        )}

        {!loading &&
          !error &&
          !svg &&
          mode === "full" &&
          templates.length === 0 && (
            <Typography color="text.secondary">
              Could not load templates from TRASER.
            </Typography>
          )}

        {svg && (
          <Box
            dangerouslySetInnerHTML={{ __html: svg }}
            sx={{ width: "100%", "& svg": { width: "100%", height: "auto" } }}
          />
        )}
      </Paper>

      {/* Stats footer */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 1, display: "block" }}
      >
        {mode === "full"
          ? `${templates.length} direct translation edges · ${schemaOptions.length} schema versions`
          : translations
            ? `${translations.length} reachable paths from ${schema} ${version}`
            : ""}
      </Typography>
    </Box>
  );
}
