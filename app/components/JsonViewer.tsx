import { useEffect, useState, type ComponentType } from "react";
import Box from "@mui/material/Box";
import type { EditorProps } from "@monaco-editor/react";
import { EditorSkeleton } from "./EditorSkeleton";

const VIEWER_OPTS = {
  readOnly: true,
  domReadOnly: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  folding: true,
  automaticLayout: true,
  renderLineHighlight: "none" as const,
  scrollbar: { alwaysConsumeMouseWheel: false },
};

const LINE_HEIGHT = 19;
const VERTICAL_PADDING = 16;

function viewerHeight(value: string, minHeight: number, maxHeight: number): number {
  const lines = value.split("\n").length;
  return Math.min(Math.max(lines * LINE_HEIGHT + VERTICAL_PADDING, minHeight), maxHeight);
}

interface JsonViewerProps {
  value: string;
  minHeight?: number;
  maxHeight?: number;
}

export function JsonViewer({ value, minHeight = 120, maxHeight = 360 }: JsonViewerProps) {
  const [Editor, setEditor] = useState<ComponentType<EditorProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([import("@monaco-editor/react"), import("monaco-editor")]).then(
      ([{ default: ReactEditor, loader }, monaco]) => {
        if (cancelled) return;
        loader.config({ monaco });
        setEditor(() => ReactEditor);
      },
    );
    return () => { cancelled = true; };
  }, []);

  const height = viewerHeight(value, minHeight, maxHeight);

  return (
    <Box sx={{ height, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
      {Editor
        ? <Editor height="100%" language="json" theme="vs" value={value} options={VIEWER_OPTS} />
        : <EditorSkeleton />}
    </Box>
  );
}
