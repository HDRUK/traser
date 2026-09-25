import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { alpha } from "@mui/material/styles";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import type { SchemaRef } from "../../stores/playgroundStore";
import type { ValidationState } from "../../lib/playground/types";

// Hoisted to module scope (not nested in PlaygroundPage) so it keeps a stable
// component identity across the parent's frequent re-renders (every keystroke in
// the JSON editor) instead of remounting each time.
export function OutputBadge({ outputSchema, validateOutputOn, outputValidation }: {
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
      sx={{ height: 20, fontSize: "0.65rem", bgcolor: (theme) => alpha(theme.palette.success.main, 0.15), color: "success.light", "& .MuiChip-icon": { color: "success.main" } }} />;
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
          sx={{ height: 20, fontSize: "0.65rem", bgcolor: (theme) => alpha(theme.palette.error.main, 0.15), color: "error.light", "& .MuiChip-icon": { color: "error.main" } }} />
      </Tooltip>
    );
  }
  return <Chip size="small" label={`Checking ${label}…`}
    sx={{ height: 20, fontSize: "0.65rem", bgcolor: (theme) => alpha(theme.palette.text.primary, 0.06), color: "text.secondary" }} />;
}
