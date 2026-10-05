import type { editor as MonacoEditorNS } from "monaco-editor";
import type { ValidationError } from "./types";
import { findJsonPathRange } from "./jsonPointer";

export const MONACO_ERROR_DECORATION_COLOR = "#f44336";

// Builds Monaco decorations from a list of AJV validation errors.
// Groups errors by instancePath so that anyOf/multi-branch failures on the
// same field produce one decoration with an aggregated hover, not N duplicates.
export function buildValidationDecorations(
  errors: ValidationError[],
  text: string,
  model: MonacoEditorNS.ITextModel
): MonacoEditorNS.IModelDeltaDecoration[] {
  const DECO_OPTS = (hoverMessage: { value: string }): MonacoEditorNS.IModelDecorationOptions => ({
    inlineClassName: "traser-error-token",
    hoverMessage,
    overviewRuler: { color: MONACO_ERROR_DECORATION_COLOR, position: 4 },
  });

  const decos: MonacoEditorNS.IModelDeltaDecoration[] = [];

  // Partition: addProp errors use text-search; all others are grouped by path
  const byPath = new Map<string, ValidationError[]>();
  const addPropErrors: ValidationError[] = [];

  for (const err of errors) {
    if (err.params?.additionalProperty) {
      addPropErrors.push(err);
    } else {
      const key = err.instancePath || "";
      if (!byPath.has(key)) byPath.set(key, []);
      byPath.get(key)!.push(err);
    }
  }

  // Path-based decorations — one per unique path, hover aggregates all errors at that path
  for (const [path, errs] of byPath) {
    if (!path) continue; // root-level errors have no specific location to highlight
    const hoverLines: string[] = [];
    if (errs.length === 1) {
      const e = errs[0];
      const invalidVal = typeof e.invalidValue === "string" ? e.invalidValue : undefined;
      hoverLines.push(`**${path}**: ${e.message ?? "error"}${invalidVal ? ` ("${invalidVal}")` : ""}`);
      if (e.allowedValues && e.allowedValues.length > 0) {
        hoverLines.push(`Allowed: ${e.allowedValues.map(v => JSON.stringify(v)).join(", ")}`);
      } else if (e.suggestion) {
        hoverLines.push(`*${e.suggestion}*`);
      }
    } else {
      hoverLines.push(`**${path}**: ${errs.length} errors`);
      hoverLines.push(errs.map(e => `- ${e.message ?? "error"}`).join("\n"));
    }
    const hoverMessage = { value: hoverLines.join("\n\n") };
    const offsets = findJsonPathRange(text, path);
    if (!offsets) continue;
    const start = model.getPositionAt(offsets.startOffset);
    const end   = model.getPositionAt(offsets.endOffset);
    decos.push({
      range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
      options: DECO_OPTS(hoverMessage),
    });
  }

  // additionalProperties decorations — text-search for the unexpected key name
  for (const err of addPropErrors) {
    const addProp = err.params!.additionalProperty as string;
    const hoverMessage = { value: `**${err.instancePath || "(root)"}**: ${err.message ?? "error"} ("${addProp}")` };
    const matches = model.findMatches(`"${addProp}"`, false, false, true, null, false);
    for (const match of matches) {
      decos.push({ range: match.range, options: DECO_OPTS(hoverMessage) });
    }
  }

  return decos;
}
