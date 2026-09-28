import { useTheme } from "@mui/material/styles";
import { CellStatus } from "./enums";

// MUI Chip forces its own icon colour, overriding the icon's inline sx — so a
// Chip-hosted status icon needs this explicit map instead of the sx strings
// StatusIcon itself uses.
export function useStatusIconColour(): Record<CellStatus, string> {
  const theme = useTheme();
  return {
    [CellStatus.Ok]: theme.palette.success.main,
    [CellStatus.Invalid]: theme.palette.warning.main,
    [CellStatus.Failed]: theme.palette.error.main,
    [CellStatus.Pending]: theme.palette.grey[500],
  };
}

// Recharts takes a resolved colour, not an sx palette string. Pending is a
// darker grey than useStatusIconColour's for contrast against the pie's white
// background.
export function useStatusFillColour(): Record<CellStatus, string> {
  const theme = useTheme();
  return {
    [CellStatus.Ok]: theme.palette.success.main,
    [CellStatus.Invalid]: theme.palette.warning.main,
    [CellStatus.Failed]: theme.palette.error.main,
    [CellStatus.Pending]: theme.palette.grey[700],
  };
}
