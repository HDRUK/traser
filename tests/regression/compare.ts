export type DiffKind = "missing" | "extra" | "type" | "value" | "length";

export interface Diff {
  path: string;
  kind: DiffKind;
  expected: unknown;
  actual: unknown;
}

const typeOf = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const child = (base: string, key: string | number): string =>
  typeof key === "number" ? `${base}[${key}]` : base === "" ? key : `${base}.${key}`;

const MAX_PREVIEW = 200;

export function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW)}…` : text;
}

export function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = normalise((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function diffValues(expected: unknown, actual: unknown, base = ""): Diff[] {
  const expectedType = typeOf(expected);
  const actualType = typeOf(actual);

  if (expectedType !== actualType) {
    return [{ path: base, kind: "type", expected, actual }];
  }

  if (expectedType === "array") {
    const a = expected as unknown[];
    const b = actual as unknown[];
    const diffs: Diff[] = [];
    if (a.length !== b.length) {
      diffs.push({ path: base, kind: "length", expected: a.length, actual: b.length });
    }
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      diffs.push(...diffValues(a[i], b[i], child(base, i)));
    }
    return diffs;
  }

  if (expectedType === "object") {
    const a = expected as Record<string, unknown>;
    const b = actual as Record<string, unknown>;
    const diffs: Diff[] = [];
    for (const key of Object.keys(a).sort()) {
      if (!(key in b)) {
        diffs.push({ path: child(base, key), kind: "missing", expected: a[key], actual: undefined });
        continue;
      }
      diffs.push(...diffValues(a[key], b[key], child(base, key)));
    }
    for (const key of Object.keys(b).sort()) {
      if (!(key in a)) {
        diffs.push({ path: child(base, key), kind: "extra", expected: undefined, actual: b[key] });
      }
    }
    return diffs;
  }

  if (!Object.is(expected, actual)) {
    return [{ path: base, kind: "value", expected, actual }];
  }
  return [];
}

export function formatDiff(d: Diff): string {
  const where = d.path === "" ? "<root>" : d.path;
  switch (d.kind) {
    case "missing":
      return `${where}: missing (production had ${preview(d.expected)})`;
    case "extra":
      return `${where}: unexpected extra key (now ${preview(d.actual)})`;
    case "length":
      return `${where}: array length ${d.expected} → ${d.actual}`;
    case "type":
      return `${where}: type ${typeOf(d.expected)} → ${typeOf(d.actual)}`;
    default:
      return `${where}: ${preview(d.expected)} → ${preview(d.actual)}`;
  }
}

export function baseContentType(value: string | null): string | null {
  return value === null ? null : value.split(";")[0].trim().toLowerCase();
}
