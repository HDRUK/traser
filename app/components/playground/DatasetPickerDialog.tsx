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

import type { DatasetRef } from "../../stores/playgroundStore";
import type { DatasetOption } from "../../lib/playground/types";

export function DatasetPickerDialog({ open, onClose, datasets, datasetFilter, onFilterChange, selectedDataset, onSelect }: {
  open: boolean;
  onClose: () => void;
  datasets: DatasetOption[];
  datasetFilter: string;
  onFilterChange: (value: string) => void;
  selectedDataset: DatasetRef | null;
  onSelect: (d: DatasetOption) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1, py: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Load dataset</Typography>
          <Typography variant="caption" color="text.secondary">
            {datasets.length > 0 ? `${datasets.length} datasets available` : "Loading…"}
          </Typography>
        </Box>
        <IconButton size="small" aria-label="Close dataset picker" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Box sx={{ px: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <SearchBar
          fullWidth size="small" autoFocus debounceMs={0}
          placeholder="Search datasets…"
          value={datasetFilter}
          onChange={onFilterChange}
        />
      </Box>
      <DialogContent sx={{ p: 0, maxHeight: 400, overflowY: "auto" }}>
        {(() => {
          const filtered = datasets.filter(d => d.title.toLowerCase().includes(datasetFilter.toLowerCase()));
          if (filtered.length === 0) return (
            <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
              <Typography variant="body2">No datasets match &quot;{datasetFilter}&quot;</Typography>
            </Box>
          );
          return (
            <List dense disablePadding>
              {filtered.map((d) => (
                <ListItem key={d.pid} disablePadding divider>
                  <ListItemButton
                    selected={selectedDataset?.pid === d.pid}
                    onClick={() => onSelect(d)}
                    sx={{ py: 1, px: 2 }}
                  >
                    <ListItemText
                      primary={d.title}
                      slotProps={{ primary: { variant: "body2", sx: { fontWeight: selectedDataset?.pid === d.pid ? 700 : 400 } } }}
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
