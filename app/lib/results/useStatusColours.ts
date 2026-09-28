import { useTheme } from "@mui/material/styles";
import { CellStatus } from "./enums";

// Recharts takes a resolved colour, not an sx palette string, so the pie
// chart's fills come from here rather than the sx strings StatusIcon uses.
export function useStatusFillColour(): Record<CellStatus, string> {
  const theme = useTheme();
  return {
    [CellStatus.Ok]: theme.palette.success.main,
    [CellStatus.Invalid]: theme.palette.warning.main,
    [CellStatus.Failed]: theme.palette.error.main,
    [CellStatus.Pending]: theme.palette.grey[700],
  };
}
