const BOOLEAN_VALUES: Record<string, boolean> = {
  "1": true,
  true: true,
  "0": false,
  false: false,
};

export function envBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;

  const parsed = BOOLEAN_VALUES[value];
  if (parsed === undefined) {
    throw new Error(`${name} must be one of 1, true, 0, false — got "${raw}"`);
  }
  return parsed;
}
