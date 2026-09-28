import type { ReactElement } from "react";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { alpha, type Theme } from "@mui/material/styles";
import { tokens } from "@hdruk/ui/theme";

export type StatusChipTone = "primary" | "success" | "error" | "neutral";

function toneSx(tone: StatusChipTone, variant: "filled" | "outlined") {
  if (tone === "neutral") {
    return variant === "outlined"
      ? { borderColor: "text.disabled", color: "text.secondary" }
      : { bgcolor: (theme: Theme) => alpha(theme.palette.text.primary, 0.06), color: "text.secondary" };
  }
  return variant === "outlined"
    ? { borderColor: `${tone}.main`, color: `${tone}.main` }
    : {
        bgcolor: (theme: Theme) => alpha(theme.palette[tone].main, 0.15),
        color: `${tone}.dark`,
        "& .MuiChip-icon": { color: `${tone}.main` },
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
