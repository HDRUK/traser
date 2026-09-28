import Box from "@mui/material/Box";
import { StatusChip, type StatusChipTone } from "~/components/StatusChip";
import { CellStatus } from "~/lib/results/enums";
import { STATUS_LABEL, STATUS_LEGEND_ORDER } from "~/lib/results/status";
import { StatusIcon } from "./StatusIcon";

const STATUS_TONE: Record<CellStatus, StatusChipTone> = {
  [CellStatus.Ok]: "success",
  [CellStatus.Invalid]: "warning",
  [CellStatus.Failed]: "error",
  [CellStatus.Pending]: "neutral",
};

export function StatusLegend() {
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
      {STATUS_LEGEND_ORDER.map((status) => (
        <StatusChip
          key={status}
          variant="outlined"
          tone={STATUS_TONE[status]}
          label={STATUS_LABEL[status]}
          icon={<StatusIcon status={status} fontSize={16} />}
        />
      ))}
    </Box>
  );
}
