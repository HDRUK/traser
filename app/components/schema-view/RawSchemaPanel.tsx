import { useState } from "react";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CodeIcon from "@mui/icons-material/Code";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import type { JsonSchema } from "~/lib/schema-view/classDiagramBuilder";

export function RawSchemaPanel({ schema }: { schema: JsonSchema }) {
  const [open, setOpen] = useState(false);

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={open}
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1.5,
          py: 0.75,
          cursor: "pointer",
          borderBottom: open ? "1px solid" : "none",
          borderColor: "divider",
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: "-2px",
          },
        }}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <CodeIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} />
        <Typography variant="caption" sx={{ flex: 1, color: "text.secondary" }}>
          Raw JSON Schema
        </Typography>
        {open ? (
          <ExpandLessIcon fontSize="small" sx={{ color: "text.secondary" }} />
        ) : (
          <ExpandMoreIcon fontSize="small" sx={{ color: "text.secondary" }} />
        )}
      </Box>
      <Collapse in={open}>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            bgcolor: "grey.100",
            color: "text.primary",
            fontFamily: "monospace",
            fontSize: "0.72rem",
            lineHeight: 1.6,
            overflow: "auto",
            maxHeight: "50vh",
          }}
        >
          {JSON.stringify(schema, null, 2)}
        </Box>
      </Collapse>
    </Paper>
  );
}
