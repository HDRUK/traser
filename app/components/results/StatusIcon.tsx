import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import WarningIcon from "@mui/icons-material/Warning";
import { CellStatus } from "~/lib/results/enums";

export function StatusIcon({ status, fontSize = 20 }: { status: CellStatus; fontSize?: number }) {
  switch (status) {
    case CellStatus.Ok:
      return <CheckCircleIcon sx={{ color: "success.main", fontSize }} />;
    case CellStatus.Invalid:
      return <WarningIcon sx={{ color: "warning.contrastText", fontSize }} />;
    case CellStatus.Failed:
      return <CancelIcon sx={{ color: "error.main", fontSize }} />;
    case CellStatus.Pending:
      return <HourglassEmptyIcon sx={{ color: "text.disabled", fontSize }} />;
  }
}
