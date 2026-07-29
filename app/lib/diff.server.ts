export type ChangeType = "added" | "removed" | "changed" | "type-changed";

export interface DiffEntry {
  path: string;
  before: unknown;
  after: unknown;
  changeType: ChangeType;
}

export function diffValues(before: unknown, after: unknown, path = "$"): DiffEntry[] {
  if (before === after) return [];

  const beforeIsArray = Array.isArray(before);
  const afterIsArray = Array.isArray(after);

  if (typeof before !== typeof after || beforeIsArray !== afterIsArray) {
    return [{ path, before, after, changeType: "type-changed" }];
  }

  if (before === null || after === null || typeof before !== "object") {
    return [{ path, before, after, changeType: "changed" }];
  }

  if (beforeIsArray && afterIsArray) {
    const beforeArr = before as unknown[];
    const afterArr = after as unknown[];
    const entries: DiffEntry[] = [];
    const len = Math.max(beforeArr.length, afterArr.length);
    for (let i = 0; i < len; i++) {
      const childPath = `${path}[${i}]`;
      if (i >= beforeArr.length) entries.push({ path: childPath, before: undefined, after: afterArr[i], changeType: "added" });
      else if (i >= afterArr.length) entries.push({ path: childPath, before: beforeArr[i], after: undefined, changeType: "removed" });
      else entries.push(...diffValues(beforeArr[i], afterArr[i], childPath));
    }
    return entries;
  }

  const beforeObj = before as Record<string, unknown>;
  const afterObj = after as Record<string, unknown>;
  const entries: DiffEntry[] = [];
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  for (const key of keys) {
    const childPath = `${path}.${key}`;
    if (!(key in beforeObj)) entries.push({ path: childPath, before: undefined, after: afterObj[key], changeType: "added" });
    else if (!(key in afterObj)) entries.push({ path: childPath, before: beforeObj[key], after: undefined, changeType: "removed" });
    else entries.push(...diffValues(beforeObj[key], afterObj[key], childPath));
  }
  return entries;
}
