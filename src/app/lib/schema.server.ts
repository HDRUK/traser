import { readFile } from "fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const SCHEMA_LOCATION = process.env.SCHEMA_LOCATION ?? "";
const CACHE_TTL = parseInt(process.env.CACHE_REFRESH_STDTLL ?? "3600") * 1000;

// ─── In-process TTL cache ─────────────────────────────────────────────────

const _cache = new Map<string, { data: unknown; expires: number }>();

function getCached(key: string): unknown | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) { _cache.delete(key); return undefined; }
  return entry.data;
}

function setCached(key: string, data: unknown): void {
  _cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// ─── I/O ──────────────────────────────────────────────────────────────────

async function fetchOrReadJson(url: string): Promise<unknown> {
  const cached = getCached(url);
  if (cached !== undefined) return cached;

  let data: unknown;
  if (url.startsWith("http")) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    data = await res.json();
  } else {
    data = JSON.parse(await readFile(url, "utf-8"));
  }

  setCached(url, data);
  return data;
}

// ─── AJV ──────────────────────────────────────────────────────────────────

const ajv = new Ajv({
  strict: false,
  strictSchema: false,
  strictTypes: false,
  allErrors: false,
  coerceTypes: true,
  useDefaults: true,
});
addFormats(ajv);

// ─── Paths ────────────────────────────────────────────────────────────────

const loadFromLocal = !SCHEMA_LOCATION.startsWith("http");

function schemaPath(model: string, version: string): string {
  return `${SCHEMA_LOCATION}/hdr_schemata/models/${model}/${version}/schema.json`;
}

function hydrationSchemaPath(model: string, version: string): string {
  return `${SCHEMA_LOCATION}/docs/${model}/${version}.form.json`;
}

function availablePath(): string {
  return loadFromLocal
    ? `${SCHEMA_LOCATION}/available.json`
    : `${SCHEMA_LOCATION}/available.json`;
}

// ─── Lazy init ────────────────────────────────────────────────────────────

let _initPromise: Promise<void> | null = null;

export function ensureLoaded(): Promise<void> {
  if (!_initPromise) _initPromise = loadSchemas();
  return _initPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function getAvailableSchemas(): Promise<Record<string, string[]>> {
  return fetchOrReadJson(availablePath()) as Promise<Record<string, string[]>>;
}

export async function loadSchemas(): Promise<void> {
  const schemas = await getAvailableSchemas();
  for (const [name, versions] of Object.entries(schemas)) {
    for (const version of versions) {
      try {
        const schema = await fetchOrReadJson(schemaPath(name, version));
        const key = `${name}:${version}`;
        ajv.removeSchema(key);
        ajv.addSchema(schema as object, key);
      } catch (err) {
        console.warn(`Failed to load schema ${name}:${version}`, err);
      }
    }
  }
}

export function getSchema(name: string, version: string) {
  return ajv.getSchema(`${name}:${version}`);
}

export async function validateMetadata(
  metadata: unknown,
  modelName: string,
  modelVersion: string
): Promise<unknown[]> {
  const validator = getSchema(modelName, modelVersion);
  if (!validator) return [{ message: `Schema ${modelName}:${modelVersion} is not known` }];
  const ok = validator(metadata);
  return ok ? [] : (validator.errors ?? []);
}

export async function validateMetadataSection(
  metadata: unknown,
  modelName: string,
  modelVersion: string,
  subsection: string
): Promise<unknown[]> {
  const ref = `${modelName}:${modelVersion}#/properties/${subsection}`;
  const validator = ajv.getSchema(ref);
  if (!validator) return [{ message: `Schema ${modelName}:${modelVersion}#${subsection} is not known` }];
  const section = (metadata as Record<string, unknown>)[subsection];
  if (!section) return [{ message: `Subsection ${subsection} not found` }];
  const ok = validator(section);
  return ok ? [] : (validator.errors ?? []);
}

export async function findMatchingSchemas(
  metadata: unknown,
  withErrors = false
): Promise<Array<{ name: string; version: string; matches: boolean; errors?: unknown }>> {
  const schemas = await getAvailableSchemas();
  const results: Array<{ name: string; version: string; matches: boolean; errors?: unknown }> = [];

  for (const [schema, versions] of Object.entries(schemas)) {
    for (const version of versions) {
      try {
        const validator = getSchema(schema, version);
        if (!validator) continue;
        // Clone to prevent AJV mutation side-effects (coerceTypes / useDefaults)
        const clone = structuredClone(metadata);
        const ok = Boolean(validator({ ...(clone as object) }));
        const entry: { name: string; version: string; matches: boolean; errors?: unknown } = { name: schema, version, matches: ok };
        if (withErrors) entry.errors = validator.errors;
        results.push(entry);
      } catch (err) {
        console.error(`Error validating ${schema}:${version}`, err);
      }
    }
  }

  return results;
}

export async function retrieveHydrationSchema(model: string, version: string): Promise<unknown> {
  return fetchOrReadJson(hydrationSchemaPath(model, version));
}
