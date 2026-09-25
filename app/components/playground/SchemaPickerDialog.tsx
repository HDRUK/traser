import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { IconButton, SearchBar } from "@hdruk/ui";
import CloseIcon from "@mui/icons-material/Close";

import type { SchemaRef } from "../../stores/playgroundStore";

export function SchemaPickerDialog({ open, onClose, allSchemaRefs, schemaPickerFilter, onFilterChange, inputSchema, onSelect }: {
  open: boolean;
  onClose: () => void;
  allSchemaRefs: Array<{ key: string; name: string; version: string }>;
  schemaPickerFilter: string;
  onFilterChange: (value: string) => void;
  inputSchema: SchemaRef | null;
  onSelect: (s: { name: string; version: string }) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1, py: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Select input schema</Typography>
          <Typography variant="caption" color="text.secondary">
            {allSchemaRefs.length} schemas available
          </Typography>
        </Box>
        <IconButton size="small" aria-label="Close schema picker" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Box sx={{ px: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <SearchBar
          fullWidth size="small" autoFocus debounceMs={0}
          placeholder="Filter schemas…"
          value={schemaPickerFilter}
          onChange={onFilterChange}
        />
      </Box>
      <DialogContent sx={{ p: 0, maxHeight: 400, overflowY: "auto" }}>
        {(() => {
          const filtered = allSchemaRefs.filter(s =>
            `${s.name} ${s.version}`.toLowerCase().includes(schemaPickerFilter.toLowerCase())
          );
          if (filtered.length === 0) return (
            <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
              <Typography variant="body2">No schemas match &quot;{schemaPickerFilter}&quot;</Typography>
            </Box>
          );
          return (
            <List dense disablePadding>
              {filtered.map((s) => (
                <ListItem key={s.key} disablePadding divider>
                  <ListItemButton
                    selected={inputSchema?.name === s.name && inputSchema?.version === s.version}
                    onClick={() => onSelect(s)}
                    sx={{ py: 1, px: 2 }}
                  >
                    <ListItemText
                      primary={`${s.name} ${s.version}`}
                      slotProps={{ primary: { variant: "body2", sx: { fontFamily: "monospace", fontSize: "0.9rem", fontWeight: inputSchema?.name === s.name && inputSchema?.version === s.version ? 700 : 400 } } }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
