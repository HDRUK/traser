import { useEffect, useId, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useLoaderData, useNavigate } from "react-router";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CodeIcon from "@mui/icons-material/Code";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import type { Route } from "./+types/schema-view";
import {
  ensureLoaded,
  getAvailableSchemas,
  getSchema,
} from "~/lib/schema.server";
import { requireAuth } from "~/lib/auth.server";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

// ─── Loader ───────────────────────────────────────────────────────────────

type JsonSchema = Record<string, unknown>;

interface SchemaResponse {
  name: string;
  version: string;
  schema: JsonSchema;
}

export async function loader({ request }: Route.LoaderArgs) {
  const _user = requireAuth(request);
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

  return {
    schemas,
    schemaData,
    name,
    version,
  };
}

export function meta() {
  return [{ title: "Schema View — TRASER" }];
}

// ─── JSON Schema parser ──────────────────────────────────────────────────

function getDefs(schema: JsonSchema): Record<string, JsonSchema> {
  return (schema["$defs"] ?? schema["definitions"] ?? {}) as Record<
    string,
    JsonSchema
  >;
}

/** Extract the first $ref string from a property schema (handles allOf / anyOf wrappers). */
function extractRef(propSchema: JsonSchema): string | null {
  if (typeof propSchema["$ref"] === "string") return propSchema["$ref"];

  if (Array.isArray(propSchema["allOf"])) {
    const hit = (propSchema["allOf"] as JsonSchema[]).find(
      (s) => typeof s["$ref"] === "string",
    );
    if (hit) return hit["$ref"] as string;
  }

  if (Array.isArray(propSchema["anyOf"])) {
    const hit = (propSchema["anyOf"] as JsonSchema[]).find(
      (s) => typeof s["$ref"] === "string" && s["type"] !== "null",
    );
    if (hit) return hit["$ref"] as string;
  }

  return null;
}

/** Resolve a JSON Pointer ref like "#/$defs/Summary" against the root schema. */
function resolveRef(root: JsonSchema, ref: string): JsonSchema | null {
  const parts = ref.replace(/^#\//, "").split("/");
  let node: unknown = root;
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return null;
    node = (node as Record<string, unknown>)[part];
  }
  return (node as JsonSchema) ?? null;
}

function isObjectDef(schema: JsonSchema): boolean {
  return schema["type"] === "object" && "properties" in schema;
}

function defNameFromRef(ref: string): string {
  return ref.split("/").pop() ?? ref;
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

/** Get a readable type label for a leaf property. */
function typeLabel(
  root: JsonSchema,
  propSchema: JsonSchema,
  depth = 0,
): string {
  if (depth > 3) return "Any";

  const ref = extractRef(propSchema);
  if (ref) {
    const resolved = resolveRef(root, ref);
    if (resolved) {
      if (isObjectDef(resolved)) return defNameFromRef(ref);
      return typeLabel(root, resolved, depth + 1);
    }
    return defNameFromRef(ref);
  }

  const type = propSchema["type"];
  if (type === "string") {
    if (Array.isArray(propSchema["enum"])) return "Enum";
    return "String";
  }
  if (type === "integer" || type === "number") return "Number";
  if (type === "boolean") return "Boolean";
  if (type === "null") return "Null";
  if (type === "array") {
    const items = propSchema["items"] as JsonSchema | undefined;
    if (items) {
      const itemRef = extractRef(items);
      if (itemRef) {
        const resolved = resolveRef(root, itemRef);
        if (resolved && isObjectDef(resolved))
          return `${defNameFromRef(itemRef)}[]`;
      }
    }
    return "Array";
  }

  if (Array.isArray(propSchema["anyOf"])) {
    // Pick the most descriptive non-null type
    const anyOf = propSchema["anyOf"] as JsonSchema[];
    for (const s of anyOf) {
      if (s["type"] === "null") continue;
      const label = typeLabel(root, s, depth + 1);
      if (label !== "Any") return label;
    }
    return "Any";
  }

  if (Array.isArray(propSchema["allOf"])) {
    const allOf = propSchema["allOf"] as JsonSchema[];
    for (const s of allOf) {
      const label = typeLabel(root, s, depth + 1);
      if (label !== "Any") return label;
    }
  }

  return "Any";
}

interface ClassNode {
  id: string; // sanitized identifier for Mermaid
  label: string; // human-readable name
  members: string[]; // Mermaid member lines
}

function buildClassDiagram(schema: JsonSchema): string {
  const defs = getDefs(schema);
  const classes = new Map<string, ClassNode>();
  const edges: string[] = [];
  const visited = new Set<string>();

  function visit(name: string, node: JsonSchema, depth: number) {
    if (visited.has(name) || depth > 4 || classes.size >= 25) return;
    visited.add(name);

    const properties = (node["properties"] ?? {}) as Record<string, JsonSchema>;
    const required = (node["required"] ?? []) as string[];
    const members: string[] = [];
    const childRefs: Array<{ propName: string; refName: string }> = [];

    for (const [propName, propSchema] of Object.entries(properties)) {
      const isReq = required.includes(propName);
      const marker = isReq ? "+" : " ";

      const ref = extractRef(propSchema as JsonSchema);
      if (ref) {
        const resolved = resolveRef(schema, ref);
        const refName = defNameFromRef(ref);
        if (resolved && isObjectDef(resolved)) {
          members.push(`${marker}${refName} ${propName}`);
          childRefs.push({ propName, refName });
          continue;
        }
      }

      // Check for array of objects
      if ((propSchema as JsonSchema)["type"] === "array") {
        const items = (propSchema as JsonSchema)["items"] as
          | JsonSchema
          | undefined;
        if (items) {
          const itemRef = extractRef(items);
          if (itemRef) {
            const resolved = resolveRef(schema, itemRef);
            const refName = defNameFromRef(itemRef);
            if (resolved && isObjectDef(resolved)) {
              members.push(`${marker}${refName}[] ${propName}`);
              childRefs.push({ propName: propName, refName });
              continue;
            }
          }
        }
      }

      const label = typeLabel(schema, propSchema as JsonSchema);
      members.push(`${marker}${label} ${propName}`);
    }

    const id = sanitizeId(name);
    classes.set(name, { id, label: name, members });

    for (const { propName: _, refName } of childRefs) {
      const defNode = defs[refName];
      if (defNode && isObjectDef(defNode)) {
        edges.push(`  ${id} --> ${sanitizeId(refName)}`);
        visit(refName, defNode, depth + 1);
      }
    }
  }

  // Start from root
  const rootName = (schema["title"] as string | undefined) ?? "Root";
  visit(rootName, schema, 0);

  if (classes.size === 0) return "";

  const lines: string[] = ["classDiagram"];

  for (const { id, label, members } of classes.values()) {
    const escapedLabel = label !== id ? `["${label}"]` : "";
    lines.push(`  class ${id}${escapedLabel} {`);
    for (const m of members) {
      lines.push(`    ${m}`);
    }
    lines.push("  }");
  }

  for (const edge of edges) {
    lines.push(edge);
  }

  return lines.join("\n");
}

// ─── Mermaid hook (same pattern as schema-graph.tsx) ─────────────────────

function useMermaidSvg(code: string, mode: "light" | "dark") {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    if (!code) {
      setSvg("");
      return;
    }
    setLoading(true);
    setError(null);
    setSvg("");

    import("mermaid")
      .then(({ default: mermaid }) => {
        if (mode === "dark") {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            themeVariables: {
              primaryColor: "#384B91",
              primaryTextColor: "#ffffff",
              primaryBorderColor: "#29235C",
              secondaryColor: "#2d2d2d",
              tertiaryColor: "#1e1e1e",
              lineColor: "#3DB28C",
              classText: "#e0e0e0",
            },
          });
        } else {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "default",
            themeVariables: {
              primaryColor: "#475DA7",
              primaryTextColor: "#29235C",
              primaryBorderColor: "#29235C",
              lineColor: "#3DB28C",
              secondaryColor: "#EEF1F9",
              tertiaryColor: "#F6F7F8",
              edgeLabelBackground: "#ffffff",
            },
          });
        }
        return mermaid.render(`sv-${uid}`, code);
      })
      .then(({ svg: rendered }) => {
        setSvg(rendered);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, [code, uid, mode]);

  return { svg, error, loading };
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function SchemaViewPage() {
  const { schemas, schemaData, name, version } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [selectedGroup, setSelectedGroup] = useState(name ?? "");
  const [selectedVersion, setSelectedVersion] = useState(version ?? "");
  const [rawOpen, setRawOpen] = useState(false);

  const groups = Object.keys(schemas);
  const versions = selectedGroup ? (schemas[selectedGroup] ?? []) : [];

  function handleLoad() {
    if (selectedGroup && selectedVersion) {
      navigate(
        `/schema-view?name=${encodeURIComponent(selectedGroup)}&version=${encodeURIComponent(selectedVersion)}`,
      );
    }
  }

  const {
    palette: { mode },
  } = useTheme();
  const mermaidCode = schemaData?.schema
    ? buildClassDiagram(schemaData.schema)
    : "";

  const { svg, error, loading } = useMermaidSvg(mermaidCode, mode);

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
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        {/* Controls */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
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

          <FormControl
            size="small"
            sx={{ minWidth: 140 }}
            disabled={!selectedGroup}
          >
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
            variant="contained"
            size="small"
            disabled={!selectedGroup || !selectedVersion}
            onClick={handleLoad}
          >
            View
          </Button>
        </Box>
        <Box>
          {svg && (
            <Tooltip title="Download SVG">
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
              >
                Download SVG
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Diagram */}
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
          <Typography
            color="error"
            variant="body2"
            sx={{ fontFamily: "monospace" }}
          >
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
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mb: 2, display: "block" }}
        >
          + required &nbsp;·&nbsp; (no marker) optional &nbsp;·&nbsp; depth
          limit 4, max 25 classes
        </Typography>
      )}

      {/* Raw JSON collapsible */}
      {schemaData?.schema && (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          <Box
            role="button"
            tabIndex={0}
            aria-expanded={rawOpen}
            sx={{
              display: "flex",
              alignItems: "center",
              px: 1.5,
              py: 0.75,
              cursor: "pointer",
              borderBottom: rawOpen ? "1px solid" : "none",
              borderColor: "divider",
              "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
            }}
            onClick={() => setRawOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRawOpen((o) => !o); }
            }}
          >
            <CodeIcon
              fontSize="small"
              sx={{ mr: 1, color: "text.secondary" }}
            />
            <Typography
              variant="caption"
              sx={{ flex: 1, color: "text.secondary" }}
            >
              Raw JSON Schema
            </Typography>
            {rawOpen ? (
              <ExpandLessIcon
                fontSize="small"
                sx={{ color: "text.secondary" }}
              />
            ) : (
              <ExpandMoreIcon
                fontSize="small"
                sx={{ color: "text.secondary" }}
              />
            )}
          </Box>
          <Collapse in={rawOpen}>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 2,
                bgcolor: mode === "dark" ? "#0d1117" : "grey.100",
                color: mode === "dark" ? "#c9d1d9" : "text.primary",
                fontFamily: "monospace",
                fontSize: "0.72rem",
                lineHeight: 1.6,
                overflow: "auto",
                maxHeight: "50vh",
              }}
            >
              {JSON.stringify(schemaData.schema, null, 2)}
            </Box>
          </Collapse>
        </Paper>
      )}
    </Box>
  );
}
