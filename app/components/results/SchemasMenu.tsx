import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { SCHEMA_GROUP_COLOURS, SCHEMA_GROUP_FALLBACK_COLOUR } from "~/lib/schemaGroupColours";
import type { Column } from "~/lib/results/types";

interface SchemasMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  columns: Column[];
  hiddenCols: Set<string>;
  onToggleColumn: (key: string) => void;
}

export function SchemasMenu({ anchorEl, onClose, columns, hiddenCols, onToggleColumn }: SchemasMenuProps) {
  return (
    <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={onClose}
      slotProps={{ paper: { sx: { maxHeight: 400 } } }}>
      {columns.map(({ key, schema, version }) => (
        <MenuItem key={key} dense onClick={() => onToggleColumn(key)}>
          <Checkbox size="small" checked={!hiddenCols.has(key)} disableRipple sx={{ p: 0, mr: 1 }} />
          <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: SCHEMA_GROUP_COLOURS[schema] ?? SCHEMA_GROUP_FALLBACK_COLOUR, mr: 1, flexShrink: 0 }} />
          <ListItemText primary={`${schema} ${version}`} />
        </MenuItem>
      ))}
    </Menu>
  );
}
