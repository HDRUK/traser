import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import CancelIcon from "@mui/icons-material/Cancel";

import { PANEL_HEADER_SX } from "../../lib/playground/editorConstants";
import type { SchemaRef } from "../../stores/playgroundStore";
import type { ValidationError } from "../../lib/playground/types";

const MAX_SHOWN = 4;

export function ValidationErrorPanel({
  which, errors, schema, expandedSuggestions, setExpandedSuggestions,
}: {
  which: "input" | "output";
  errors: ValidationError[];
  schema: SchemaRef | null;
  expandedSuggestions: Set<number>;
  setExpandedSuggestions: (updater: (prev: Set<number>) => Set<number>) => void;
}) {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", borderTop: (theme) => `1px solid ${alpha(theme.palette.error.main, 0.3)}`, bgcolor: (theme) => alpha(theme.palette.error.main, 0.06) }}>
      <Box sx={{ ...PANEL_HEADER_SX, bgcolor: (theme) => alpha(theme.palette.error.main, 0.12), borderBottom: (theme) => `1px solid ${alpha(theme.palette.error.main, 0.2)}` }}>
        <CancelIcon sx={{ color: "error.main", fontSize: 16 }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: "error.dark", fontFamily: "monospace", flex: 1 }}>
          {which === "output" ? "OUTPUT" : "INPUT"} VALIDATION — {errors.length} error{errors.length === 1 ? "" : "s"}
          {schema && (
            <Typography component="span" variant="caption" sx={{ ml: 1, color: "text.secondary", fontWeight: 400 }}>
              against {schema.name} {schema.version}
            </Typography>
          )}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: "auto", p: 1.25, fontFamily: "monospace", fontSize: "0.8rem", color: "error.main", lineHeight: 1.55 }}>
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
                  <Box component="span" sx={{ color: "warning.dark", ml: 1, fontStyle: "italic" }}>(&quot;{valueTag}&quot;)</Box>
                )}
                {(() => {
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
}
