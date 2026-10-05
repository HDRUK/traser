import type { ReactElement } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { TooltipProps } from "@mui/material/Tooltip";

export function CollapsedPanelHandle({
  orientation, borderSide = "none", icon, label, ariaLabel, tooltip, tooltipPlacement, onClick,
}: {
  orientation: "vertical" | "horizontal";
  borderSide?: "right" | "left" | "bottom" | "none";
  icon: ReactElement;
  label: string;
  ariaLabel: string;
  tooltip: string;
  tooltipPlacement: TooltipProps["placement"];
  onClick: () => void;
}) {
  const borderSx =
    borderSide === "right" ? { borderRight: "1px solid", borderColor: "divider" } :
    borderSide === "left" ? { borderLeft: "1px solid", borderColor: "divider" } :
    borderSide === "bottom" ? { borderBottom: "1px solid", borderColor: "divider" } :
    {};
  return (
    <Tooltip title={tooltip} placement={tooltipPlacement}>
      <Box role="button" tabIndex={0} aria-label={ariaLabel}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
        sx={{
          width: "100%", height: "100%", display: "flex",
          flexDirection: orientation === "vertical" ? "column" : "row",
          alignItems: "center", justifyContent: "center", gap: orientation === "vertical" ? 1.5 : 1,
          cursor: "pointer", bgcolor: "background.paper", transition: "background 0.15s",
          ...borderSx,
          "&:hover": { bgcolor: "action.hover" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
        }}>
        {icon}
        <Typography variant="caption" sx={{
          fontFamily: "monospace", fontSize: "0.7rem", color: "text.disabled", letterSpacing: "0.08em", userSelect: "none",
          ...(orientation === "vertical" ? { writingMode: "vertical-rl", transform: "rotate(180deg)" } : {}),
        }}>{label}</Typography>
      </Box>
    </Tooltip>
  );
}
