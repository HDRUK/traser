import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { alpha } from "@mui/material/styles";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FindInPageIcon from "@mui/icons-material/FindInPage";

import type { SchemaRef } from "../../stores/playgroundStore";
import type { ValidationState } from "../../lib/playground/types";

// Hoisted to module scope (not nested in PlaygroundPage) so it keeps a stable
// component identity across the parent's frequent re-renders (every keystroke in
// the JSON editor) instead of remounting each time.
export function InputBadge({ inputSchema, inputValidation, finding, onFind, onOpenPicker }: {
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
      sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer", bgcolor: (theme) => alpha(theme.palette.success.main, 0.15), color: "success.light", "& .MuiChip-icon": { color: "success.main" } }} />;
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
          sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer", bgcolor: (theme) => alpha(theme.palette.error.main, 0.15), color: "error.light", "& .MuiChip-icon": { color: "error.main" } }} />
      </Tooltip>
    );
  }
  return <Chip size="small" label={`Checking ${label}…`}
    onClick={onOpenPicker}
    sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer", bgcolor: (theme) => alpha(theme.palette.text.primary, 0.06), color: "text.secondary" }} />;
}
