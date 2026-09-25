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

import type { SchemaRef, TemplateRef } from "../../stores/playgroundStore";
import type { TemplateOption } from "../../lib/playground/types";

export function MappingPickerDialog({ open, onClose, inputSchema, availableTemplates, mappingFilter, onFilterChange, selectedMapping, onSelect }: {
  open: boolean;
  onClose: () => void;
  inputSchema: SchemaRef | null;
  availableTemplates: TemplateOption[];
  mappingFilter: string;
  onFilterChange: (value: string) => void;
  selectedMapping: TemplateRef | null;
  onSelect: (t: TemplateOption) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1, py: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Load mapping</Typography>
          <Typography variant="caption" color="text.secondary">
            {inputSchema
              ? `${availableTemplates.length} mapping${availableTemplates.length === 1 ? "" : "s"} for ${inputSchema.name} ${inputSchema.version}`
              : "Select an input schema first"}
          </Typography>
        </Box>
        <IconButton size="small" aria-label="Close mapping picker" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Box sx={{ px: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <SearchBar
          fullWidth size="small" autoFocus debounceMs={0}
          placeholder="Filter mappings…"
          value={mappingFilter}
          onChange={onFilterChange}
        />
      </Box>
      <DialogContent sx={{ p: 0, maxHeight: 400, overflowY: "auto" }}>
        {(() => {
          const label = (t: TemplateOption) => `${t.input_model} ${t.input_version} → ${t.output_model} ${t.output_version}`;
          const filtered = availableTemplates.filter(t => label(t).toLowerCase().includes(mappingFilter.toLowerCase()));
          if (availableTemplates.length === 0) return (
            <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
              <Typography variant="body2">{inputSchema ? "No mappings available for this schema." : "Detect the input schema first."}</Typography>
            </Box>
          );
          if (filtered.length === 0) return (
            <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
              <Typography variant="body2">No mappings match &quot;{mappingFilter}&quot;</Typography>
            </Box>
          );
          return (
            <List dense disablePadding>
              {filtered.map((t) => {
                const key = `${t.input_model}:${t.input_version}:${t.output_model}:${t.output_version}`;
                const isSelected = selectedMapping?.input_model === t.input_model && selectedMapping?.input_version === t.input_version && selectedMapping?.output_model === t.output_model && selectedMapping?.output_version === t.output_version;
                return (
                  <ListItem key={key} disablePadding divider>
                    <ListItemButton
                      selected={isSelected}
                      onClick={() => onSelect(t)}
                      sx={{ py: 1, px: 2 }}
                    >
                      <ListItemText
                        primary={label(t)}
                        slotProps={{ primary: { variant: "body2", sx: { fontWeight: isSelected ? 700 : 400, fontFamily: "monospace", fontSize: "0.85rem" } } }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
