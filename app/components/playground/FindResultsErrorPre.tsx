import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";

import type { ValidationError } from "../../lib/playground/types";

export function FindResultsErrorPre({ errors }: { errors: ValidationError[] | null | undefined }) {
  return (
    <Box component="pre" sx={{ m: 0, px: 2, py: 1.25, bgcolor: (theme) => alpha(theme.palette.error.main, 0.06), borderTop: (theme) => `1px solid ${alpha(theme.palette.error.main, 0.2)}`, fontFamily: "monospace", fontSize: "0.8rem", color: "error.dark", lineHeight: 1.6, overflow: "auto", maxHeight: 200 }}>
      {(errors ?? []).map((e, i) =>
        `${i + 1}. ${e.instancePath || "(root)"}: ${e.message ?? "error"}${e.params ? ` ${JSON.stringify(e.params)}` : ""}`
      ).join("\n")}
    </Box>
  );
}
