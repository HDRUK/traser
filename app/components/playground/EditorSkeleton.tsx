import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Loading } from "@hdruk/ui";

export function EditorSkeleton() {
  return (
    <Box sx={{ height: "100%", bgcolor: "background.paper", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
      <Loading size="small" label="" />
      <Typography variant="caption" color="text.disabled" sx={{ fontFamily: "monospace" }}>
        Loading editor…
      </Typography>
    </Box>
  );
}
