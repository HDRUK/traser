import Box from "@mui/material/Box";
import Popover from "@mui/material/Popover";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { Button } from "@hdruk/ui";
import { CellStatus } from "~/lib/results/enums";
import { STATUS_FILTER_ORDER, STATUS_LABEL } from "~/lib/results/status";
import { StatusIcon } from "./StatusIcon";

export interface ColumnFilterAnchor {
  el: HTMLElement;
  colKey: string;
}

interface ColumnFilterPopoverProps {
  anchor: ColumnFilterAnchor | null;
  onClose: () => void;
  activeStatuses: Set<CellStatus>;
  onChangeStatuses: (colKey: string, statuses: CellStatus[]) => void;
  onClearFilter: (colKey: string) => void;
}

export function ColumnFilterPopover({
  anchor, onClose, activeStatuses, onChangeStatuses, onClearFilter,
}: ColumnFilterPopoverProps) {
  return (
    <Popover open={!!anchor} anchorEl={anchor?.el} onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }} transformOrigin={{ vertical: "top", horizontal: "center" }}>
      {anchor && (
        <Box sx={{ p: 1.5, minWidth: 210 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Filter: <strong>{anchor.colKey}</strong>
          </Typography>
          <ToggleButtonGroup
            value={Array.from(activeStatuses)}
            onChange={(_, newValues: CellStatus[]) => {
              if (newValues.length === 0) onClearFilter(anchor.colKey);
              else onChangeStatuses(anchor.colKey, newValues);
            }}
            size="small" orientation="vertical" sx={{ width: "100%" }}>
            {STATUS_FILTER_ORDER.map((status) => (
              <ToggleButton key={status} value={status} sx={{ justifyContent: "flex-start", gap: 1, py: 0.5, textTransform: "none" }}>
                <StatusIcon status={status} />
                <Typography variant="caption">{STATUS_LABEL[status]}</Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {activeStatuses.size > 0 && (
            <Button size="small" fullWidth sx={{ mt: 1 }} onClick={() => { onClearFilter(anchor.colKey); onClose(); }}>
              Clear filter
            </Button>
          )}
        </Box>
      )}
    </Popover>
  );
}
