import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Button } from "@hdruk/ui";
import DownloadIcon from "@mui/icons-material/Download";

import type { Route } from "./+types/schema-view";
import { ensureLoaded, getAvailableSchemas, getSchema } from "~/lib/schema.server";
import { buildClassDiagram, type JsonSchema } from "~/lib/schema-view/classDiagramBuilder";
import { useMermaidSvg } from "~/lib/mermaid/useMermaidSvg";
import { RawSchemaPanel } from "~/components/schema-view/RawSchemaPanel";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

// ─── Loader ───────────────────────────────────────────────────────────────

interface SchemaResponse {
  name: string;
  version: string;
  schema: JsonSchema;
}

export async function loader({ request }: Route.LoaderArgs) {
  await ensureLoaded();

  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const version = url.searchParams.get("version");

  const schemas = await getAvailableSchemas().catch(
    () => ({}) as Record<string, string[]>,
  );

  let schemaData: SchemaResponse | null = null;
  if (name && version) {
    const validator = getSchema(name, version);
    if (validator?.schema) {
      schemaData = { name, version, schema: validator.schema as JsonSchema };
    }
  }

  return { schemas, schemaData, name, version };
}

export function meta() {
  return [{ title: "Schema View — TRASER" }];
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function SchemaViewPage() {
  const { schemas, schemaData, name, version } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [selectedGroup, setSelectedGroup] = useState(name ?? "");
  const [selectedVersion, setSelectedVersion] = useState(version ?? "");

  const groups = Object.keys(schemas);
  const versions = selectedGroup ? (schemas[selectedGroup] ?? []) : [];

  function handleLoad() {
    if (selectedGroup && selectedVersion) {
      navigate(
        `/schema-view?name=${encodeURIComponent(selectedGroup)}&version=${encodeURIComponent(selectedVersion)}`,
      );
    }
  }

  const mermaidCode = schemaData?.schema ? buildClassDiagram(schemaData.schema) : "";
  const { svg, error, loading } = useMermaidSvg(mermaidCode);

  function handleDownload() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schema-${name ?? "unknown"}-${version ?? "unknown"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Schema</InputLabel>
            <Select
              label="Schema"
              value={selectedGroup}
              onChange={(e) => {
                setSelectedGroup(e.target.value);
                setSelectedVersion("");
              }}
            >
              {groups.map((g) => (
                <MenuItem key={g} value={g}>
                  {g}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }} disabled={!selectedGroup}>
            <InputLabel>Version</InputLabel>
            <Select
              label="Version"
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
            >
              {versions.map((v) => (
                <MenuItem key={v} value={v}>
                  {v}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            size="small"
            disabled={!selectedGroup || !selectedVersion}
            onClick={handleLoad}
          >
            View
          </Button>
        </Box>

        {svg && (
          <Tooltip title="Download SVG">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
              >
                Download SVG
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          minHeight: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
          "& svg": { width: "100%", height: "auto" },
        }}
      >
        {loading && <CircularProgress />}

        {!loading && error && (
          <Typography color="error" variant="body2" sx={{ fontFamily: "monospace" }}>
            Diagram error: {error}
          </Typography>
        )}

        {!loading && !svg && !error && !schemaData && (
          <Typography color="text.secondary">
            Select a schema and version to visualise its structure.
          </Typography>
        )}

        {!loading && !svg && !error && schemaData && (
          <Typography color="text.secondary">
            Could not build diagram for this schema.
          </Typography>
        )}

        {svg && (
          <Box
            dangerouslySetInnerHTML={{ __html: svg }}
            sx={{ width: "100%", "& svg": { width: "100%", height: "auto" } }}
          />
        )}
      </Paper>

      {svg && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
          + required &nbsp;·&nbsp; (no marker) optional &nbsp;·&nbsp; depth limit 4, max 25
          classes
        </Typography>
      )}

      {schemaData?.schema && <RawSchemaPanel schema={schemaData.schema} />}
    </Box>
  );
}
