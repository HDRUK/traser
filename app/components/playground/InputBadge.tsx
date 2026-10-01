import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FindInPageIcon from "@mui/icons-material/FindInPage";

import { StatusChip } from "../StatusChip";
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
      <StatusChip tone="primary" variant="outlined"
        label={finding === "input" ? "Finding…" : "Find schema"}
        icon={<FindInPageIcon sx={{ fontSize: "12px !important" }} />}
        onClick={onFind}
        disabled={finding === "input"} />
    );
  }
  const label = `${inputSchema.name} ${inputSchema.version}`;
  if (inputValidation.kind === "valid") {
    return <StatusChip tone="success" label={`Valid ${label}`}
      icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
      onClick={onOpenPicker} />;
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
      <StatusChip tone="error" label={`Invalid as ${label}`}
        icon={<CancelIcon sx={{ fontSize: 14 }} />}
        onClick={onOpenPicker}
        tooltip={tip} />
    );
  }
  return <StatusChip tone="neutral" label={`Checking ${label}…`} onClick={onOpenPicker} />;
}
