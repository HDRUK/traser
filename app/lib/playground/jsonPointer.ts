// Walks a JSON string and returns the start/end character offsets of the value
// at the given JSON Pointer instance path (e.g. "/provenance/origin/datasetType/0/subTypes/1").
export function findJsonPathRange(
  text: string,
  instancePath: string
): { startOffset: number; endOffset: number } | null {
  const segments = instancePath.replace(/^\//, "").split("/").filter(Boolean);
  let i = 0;

  const ws = () => { while (i < text.length && text[i] <= " ") i++; };

  function readStr(): string | null {
    if (text[i] !== '"') return null;
    i++;
    let s = "";
    while (i < text.length) {
      if (text[i] === "\\") {
        i++;
        const c = text[i++];
        if (c === "u") { s += String.fromCharCode(parseInt(text.slice(i, i + 4), 16)); i += 4; }
        else s += ({ '"': '"', "\\": "\\", "/": "/", n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[c] ?? c;
      } else if (text[i] === '"') { i++; return s; }
      else s += text[i++];
    }
    return null;
  }

  function skip(): boolean {
    ws();
    if (i >= text.length) return false;
    const ch = text[i];
    if (ch === '"') return readStr() !== null;
    if (ch === "{") {
      i++; ws();
      if (text[i] === "}") { i++; return true; }
      while (true) {
        ws(); if (readStr() === null) return false; ws();
        if (text[i++] !== ":") return false; ws();
        if (!skip()) return false; ws();
        if (text[i] === "}") { i++; return true; }
        if (text[i++] !== ",") return false;
      }
    }
    if (ch === "[") {
      i++; ws();
      if (text[i] === "]") { i++; return true; }
      while (true) {
        ws(); if (!skip()) return false; ws();
        if (text[i] === "]") { i++; return true; }
        if (text[i++] !== ",") return false;
      }
    }
    while (i < text.length && !/[\s,\]{}"]/.test(text[i])) i++;
    return true;
  }

  function nav(depth: number): { startOffset: number; endOffset: number } | null {
    ws();
    if (depth === segments.length) {
      const start = i;
      if (!skip()) return null;
      return { startOffset: start, endOffset: i };
    }
    const seg = segments[depth].replace(/~1/g, "/").replace(/~0/g, "~");
    if (text[i] === "{") {
      i++; ws();
      if (text[i] === "}") return null;
      while (true) {
        ws();
        const key = readStr(); if (key === null) return null; ws();
        if (text[i++] !== ":") return null; ws();
        if (key === seg) return nav(depth + 1);
        if (!skip()) return null; ws();
        if (text[i] === "}") return null;
        if (text[i++] !== ",") return null;
      }
    }
    if (text[i] === "[") {
      const idx = parseInt(seg, 10); if (isNaN(idx)) return null;
      i++; ws();
      if (text[i] === "]") return null;
      for (let n = 0; ; n++) {
        ws();
        if (n === idx) return nav(depth + 1);
        if (!skip()) return null; ws();
        if (text[i] === "]") return null;
        if (text[i++] !== ",") return null;
      }
    }
    return null;
  }

  try { return nav(0); } catch { return null; }
}
