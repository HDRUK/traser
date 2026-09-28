import { useEffect, useId, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { tokens } from "@hdruk/ui/theme";

export function useMermaidSvg(
  code: string,
): { svg: string; error: string | null; loading: boolean } {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const uid = useId().replace(/:/g, "");
  const theme = useTheme();

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    setError(null);

    import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          // Explicit: sanitize diagram text (labels come from schema/template
          // names). This is mermaid's default, but the SVG is injected via
          // dangerouslySetInnerHTML, so we pin it rather than rely on the default.
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            primaryColor: theme.palette.primary.main,
            primaryTextColor: theme.palette.primary.contrastText,
            primaryBorderColor: tokens.status.information,
            lineColor: tokens.brand.secondary,
            secondaryColor: tokens.background.information,
            tertiaryColor: tokens.background.primary,
            edgeLabelBackground: tokens.background.white,
          },
          flowchart: { curve: "basis", useMaxWidth: true },
        });
        return mermaid.render(`mermaid-${uid}`, code);
      })
      .then(({ svg: rendered }) => {
        setSvg(rendered);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, [code, uid, theme]);

  return { svg, error, loading };
}
