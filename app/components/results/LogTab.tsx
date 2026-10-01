import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import {
  LOG_SURFACE_ACCENT,
  LOG_SURFACE_BACKGROUND,
  LOG_SURFACE_BORDER,
  LOG_SURFACE_TEXT,
} from "~/lib/logSurface";

export function LogTab({ log, running }: { log: string[]; running: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  if (!running && log.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography color="text.secondary">No log entries yet — run a refresh to see activity.</Typography>
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: LOG_SURFACE_BACKGROUND }}>
      {running && (
        <Box sx={{ px: 1.5, py: 0.5, borderBottom: LOG_SURFACE_BORDER }}>
          <Typography variant="caption" sx={{ color: LOG_SURFACE_ACCENT, fontFamily: "monospace" }}>● Running…</Typography>
        </Box>
      )}
      <Box sx={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto", px: 1.5, py: 1, fontFamily: "monospace", fontSize: "0.72rem", color: LOG_SURFACE_TEXT, lineHeight: 1.6 }}>
        {log.map((line, i) => <div key={i}>{line}</div>)}
        <div ref={bottomRef} />
      </Box>
    </Paper>
  );
}
