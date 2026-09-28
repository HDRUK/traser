import { alpha, type Theme } from "@mui/material/styles";

import { MONACO_ERROR_DECORATION_COLOR } from "../../lib/playground/monacoDecorations";

export function PanelSeparatorStyles({ theme }: { theme: Theme }) {
  return (
    <style>{`
      .traser-error-token { background: ${alpha(MONACO_ERROR_DECORATION_COLOR, 0.18)}; border-bottom: 2px solid ${MONACO_ERROR_DECORATION_COLOR}; }
      .traser-sep-h { background: ${theme.palette.divider}; transition: background 0.15s; }
      .traser-sep-h:hover, .traser-sep-h[data-state="drag"] { background: ${alpha(theme.palette.primary.main, 0.7)}; }
      .traser-sep-v { background: ${theme.palette.divider}; transition: background 0.15s; }
      .traser-sep-v:hover, .traser-sep-v[data-state="drag"] { background: ${alpha(theme.palette.primary.main, 0.7)}; }
    `}</style>
  );
}
