import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import { StatusChip } from "../StatusChip";
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
    return <StatusChip tone="neutral" variant="outlined" label="No output schema" />;
  }
  const label = `${outputSchema.name} ${outputSchema.version}`;
  if (!validateOutputOn) {
    return <StatusChip tone="neutral" variant="outlined" label={`Output: ${label}`} />;
  }
  if (outputValidation.kind === "valid") {
    return <StatusChip tone="success" label={`Valid ${label}`} icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} />;
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
      <StatusChip tone="error" label={`Invalid as ${label}`}
        icon={<CancelIcon sx={{ fontSize: 14 }} />}
        tooltip={tip} />
    );
  }
  return <StatusChip tone="neutral" label={`Checking ${label}…`} />;
}
