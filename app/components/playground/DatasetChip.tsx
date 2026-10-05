import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";
import { tokens } from "@hdruk/ui/theme";

import type { DatasetRef } from "../../stores/playgroundStore";

export function DatasetChip({
  loadingDataset, selectedDataset, datasetMode, onClick, onDelete,
}: {
  loadingDataset: boolean;
  selectedDataset: DatasetRef | null;
  datasetMode: "none" | "loaded" | "modified";
  onClick: () => void;
  onDelete: () => void;
}) {
  const label = loadingDataset
    ? "Loading…"
    : selectedDataset
      ? `${selectedDataset.title.length > 20 ? selectedDataset.title.slice(0, 20) + "…" : selectedDataset.title}${datasetMode === "modified" ? " (modified)" : ""}`
      : "Load dataset…";
  return (
    <Chip
      size="small"
      label={label}
      onClick={onClick}
      onDelete={selectedDataset ? onDelete : undefined}
      variant={selectedDataset ? "filled" : "outlined"}
      sx={{
        height: tokens.iconSize.small,
        fontSize: (theme) => theme.typography.caption.fontSize,
        cursor: "pointer",
        ...(selectedDataset
          ? datasetMode === "modified"
            ? { bgcolor: (theme) => alpha(theme.palette.warning.main, 0.12), color: "warning.dark" }
            : { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.15), color: "primary.main" }
          : { borderColor: "text.disabled", color: "text.secondary" }),
        "& .MuiChip-deleteIcon": { fontSize: 12 },
      }}
    />
  );
}
