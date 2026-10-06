function reviveNestedJson(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
    try {
      return reviveNestedJson(JSON.parse(trimmed));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(reviveNestedJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, reviveNestedJson(v)])
    );
  }
  return value;
}

export function formatErrorBody(body: string): string {
  try {
    return JSON.stringify(reviveNestedJson(JSON.parse(body)), null, 2);
  } catch {
    return body;
  }
}
