import type { ReactElement } from "react";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { alpha, type Theme } from "@mui/material/styles";
import { tokens } from "@hdruk/ui/theme";

export type StatusChipTone = "primary" | "success" | "error" | "warning" | "neutral";

// warning.main (#F2D12D) is a bright yellow with ~1.5:1 contrast against a
// white/light surface — far below WCAG's 3:1 minimum for UI text/icons, unlike
// every other tone's .main here. Its own contrastText is the readable choice;
// the border stays .main so the tone still reads as amber, not brown.
function toneTextColour(tone: StatusChipTone): string {
  return tone === "warning" ? "warning.contrastText" : `${tone}.main`;
}

function toneSx(tone: StatusChipTone, variant: "filled" | "outlined") {
  if (tone === "neutral") {
    return variant === "outlined"
      ? { borderColor: "text.disabled", color: "text.secondary" }
      : { bgcolor: (theme: Theme) => alpha(theme.palette.text.primary, 0.06), color: "text.secondary" };
  }
  const textColour = toneTextColour(tone);
  return variant === "outlined"
    ? { borderColor: `${tone}.main`, color: textColour, "& .MuiChip-icon": { color: textColour } }
    : {
        bgcolor: (theme: Theme) => alpha(theme.palette[tone].main, 0.15),
        color: tone === "warning" ? textColour : `${tone}.dark`,
        "& .MuiChip-icon": { color: textColour },
      };
}

export function StatusChip({ label, tone, variant = "filled", icon, onClick, disabled, tooltip }: {
  label: string;
  tone: StatusChipTone;
  variant?: "filled" | "outlined";
  icon?: ReactElement;
  onClick?: () => void;
  disabled?: boolean;
  tooltip?: string;
}) {
  const chip = (
    <Chip
      size="small"
      variant={variant === "outlined" ? "outlined" : undefined}
      label={label}
      icon={icon}
      onClick={onClick}
      disabled={disabled}
      sx={{
        height: tokens.iconSize.small,
        fontSize: (theme) => theme.typography.caption.fontSize,
        cursor: onClick ? "pointer" : undefined,
        ...toneSx(tone, variant),
      }}
    />
  );
  return tooltip ? <Tooltip title={tooltip}>{chip}</Tooltip> : chip;
}
