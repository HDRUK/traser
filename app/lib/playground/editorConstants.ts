export const EDITOR_OPTS = { minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: "on" as const };

export const PANEL_HEADER_SX = {
  display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75,
  bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider",
  flexShrink: 0, minHeight: 36,
};
