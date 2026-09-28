export const ROWS_PER_PAGE_OPTIONS = [25, 50, 100];

export const AUTO_REVALIDATE_INTERVAL_MS = 5_000;

export function gatewayDatasetUrl(gatewayId: string | number): string {
  return `https://healthdatagateway.org/en/dataset/${gatewayId}`;
}

export const GROUP_HEADER_DIVIDER_COLOUR = "rgba(255,255,255,0.25)";
export const GROUP_HEADER_ICON_DIM_COLOUR = "rgba(255,255,255,0.4)";

export const DATASET_COUNT_ACCENT_COLOUR = "#90caf9";

export const PIE_TOOLTIP_BACKGROUND = "#1e1e1e";
export const PIE_TOOLTIP_BORDER = "1px solid rgba(255,255,255,0.1)";

export const LOG_SURFACE_BACKGROUND = "#0d1117";
export const LOG_SURFACE_TEXT = "#c9d1d9";
export const LOG_SURFACE_ACCENT = "#58a6ff";
export const LOG_SURFACE_BORDER = "1px solid rgba(255,255,255,0.1)";
