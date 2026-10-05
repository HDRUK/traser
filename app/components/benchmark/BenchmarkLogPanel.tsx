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
import { LOG_PANEL_MAX_HEIGHT } from "~/lib/benchmark/constants";

export function BenchmarkLogPanel({ log, running }: { log: string[]; running: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  if (log.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: LOG_SURFACE_BACKGROUND, mt: 2 }}>
      {running && (
        <Box sx={{ px: 1.5, py: 0.5, borderBottom: LOG_SURFACE_BORDER }}>
          <Typography variant="caption" sx={{ color: LOG_SURFACE_ACCENT, fontFamily: "monospace" }}>● Running…</Typography>
        </Box>
      )}
      <Box
        sx={{
          maxHeight: LOG_PANEL_MAX_HEIGHT,
          overflowY: "auto",
          px: 1.5,
          py: 1,
          fontFamily: "monospace",
          fontSize: (theme) => theme.typography.caption.fontSize,
          color: LOG_SURFACE_TEXT,
          lineHeight: 1.6,
        }}
      >
        {log.map((line, i) => <div key={i}>{line}</div>)}
        <div ref={bottomRef} />
      </Box>
    </Paper>
  );
}
