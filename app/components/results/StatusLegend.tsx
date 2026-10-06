import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { StatusChip, type StatusChipTone } from "~/components/StatusChip";
import { CellStatus } from "~/lib/results/enums";
import { SCHEMA_ACCENT_COLOUR } from "~/lib/schemaGroupColours";
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
      <Typography variant="caption" sx={{ display: "flex", alignItems: "center", color: "text.secondary" }}>
        <Typography component="span" sx={{ color: SCHEMA_ACCENT_COLOUR, fontWeight: 700, mr: 0.25 }}>*</Typography>
dataset&apos;s native GWDM version
      </Typography>
    </Box>
  );
}
