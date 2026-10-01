import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";
import { tokens } from "@hdruk/ui/theme";

import type { TemplateRef } from "../../stores/playgroundStore";

export function MappingChip({
  mappingMode, selectedMapping, onClick,
}: {
  mappingMode: "known" | "custom";
  selectedMapping: TemplateRef | null;
  onClick: () => void;
}) {
  if (mappingMode === "known" && selectedMapping) {
    return (
      <Chip size="small"
        label={`${selectedMapping.input_model} ${selectedMapping.input_version} → ${selectedMapping.output_model} ${selectedMapping.output_version}`}
        onClick={onClick}
        sx={{ height: tokens.iconSize.small, fontSize: (theme) => theme.typography.caption.fontSize, cursor: "pointer", bgcolor: (theme) => alpha(theme.palette.primary.main, 0.25), color: "primary.dark" }} />
    );
  }
  return (
    <Chip size="small"
      label={selectedMapping ? "Custom (modified)" : "Load mapping…"}
      onClick={onClick}
      variant={!selectedMapping ? "outlined" : "filled"}
      sx={{ height: tokens.iconSize.small, fontSize: (theme) => theme.typography.caption.fontSize, cursor: "pointer", ...(selectedMapping ? { bgcolor: (theme) => alpha(theme.palette.warning.main, 0.18), color: "warning.dark" } : { borderColor: "text.disabled", color: "text.secondary" }) }} />
  );
}
