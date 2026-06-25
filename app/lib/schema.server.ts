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
  allErrors: true,
  coerceTypes: true,
  useDefaults: true,
});
addFormats(ajv);

// ─── Property index ───────────────────────────────────────────────────────

const _propertyIndexCache = new Map<string, Map<string, string[]>>();

// ─── Name-discriminator map ───────────────────────────────────────────────
// Maps a discriminator name literal (e.g. "Health and disease") to the allowed
// enum values for its subTypes property. Used to correct anyOf branch errors.

const _nameDiscriminatorCache = new Map<string, Map<string, unknown[]>>();

export function buildNameDiscriminatorMap(schema: object): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>();
  const root = schema as Record<string, unknown>;
  const defs: Record<string, unknown> =
    (root["$defs"] as Record<string, unknown>) ??
    (root["definitions"] as Record<string, unknown>) ?? {};

  for (const defSchema of Object.values(defs)) {
    const def = defSchema as Record<string, unknown>;
    const props = def["properties"] as Record<string, unknown> | undefined;
    if (!props) continue;

    const nameProp = props["name"] as Record<string, unknown> | undefined;
    const subTypesProp = props["subTypes"] as Record<string, unknown> | undefined;
    if (!nameProp || !subTypesProp) continue;

    // Detect the Literal: true discriminator pattern used in schemata-2
    if (!nameProp["Literal"]) continue;
    const nameDefault = nameProp["default"] as string | undefined;
    if (!nameDefault) continue;

    // Find the enum for subTypes → anyOf[0].items.$ref
    const subTypesAnyOf = (subTypesProp["anyOf"] as unknown[]) ?? [];
    for (const branch of subTypesAnyOf) {
      const b = branch as Record<string, unknown>;
      const items = b["items"] as Record<string, unknown> | undefined;
      if (!items) continue;
      const ref = items["$ref"] as string | undefined;
      if (!ref) continue;
      const refName = ref.replace(/^#\/\$defs\//, "").replace(/^#\/definitions\//, "");
      const refDef = defs[refName] as Record<string, unknown> | undefined;
      if (!refDef) continue;
      const ev = refDef["enum"] as unknown[] | undefined;
      if (ev) { map.set(nameDefault, ev); break; }
    }
  }

  return map;
}

export function getNameDiscriminatorMap(name: string, version: string): Map<string, unknown[]> {
  return _nameDiscriminatorCache.get(`${name}:${version}`) ?? new Map();
}

/**
 * Walks a JSON Schema's $defs (or definitions), following $ref links, and
 * produces a map from property name → all dot-paths where that property
 * appears (e.g. "typicalAgeRangeMin" → ["coverage.typicalAgeRangeMin"]).
 */
export function buildPropertyIndex(schema: object): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const defs: Record<string, object> =
    (schema as Record<string, unknown>)["$defs"] as Record<string, object> ??
    (schema as Record<string, unknown>)["definitions"] as Record<string, object> ??
    {};

  function resolveRef(ref: string): object | undefined {
    // refs look like "#/$defs/SomeName" or "#/definitions/SomeName"
    const parts = ref.replace(/^#\//, "").split("/");
    let node: unknown = schema;
    for (const p of parts) {
      if (node == null || typeof node !== "object") return undefined;
      node = (node as Record<string, unknown>)[p];
    }
    return node as object | undefined;
  }

  function walk(node: unknown, path: string): void {
    if (node == null || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    // If this node is a $ref, resolve and walk the target instead
    if (typeof obj["$ref"] === "string") {
      const target = resolveRef(obj["$ref"]);
      if (target) walk(target, path);
      return;
    }

    const props = obj["properties"] as Record<string, unknown> | undefined;
    if (props) {
      for (const [propName, propSchema] of Object.entries(props)) {
        const childPath = path ? `${path}.${propName}` : propName;
        // Record this property name → path
        const existing = index.get(propName);
        if (existing) {
          existing.push(childPath);
        } else {
          index.set(propName, [childPath]);
        }
        // Recurse into the property schema
        walk(propSchema, childPath);
      }
    }

    // Walk allOf / anyOf / oneOf / if / then / else
    for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
      const arr = obj[keyword] as unknown[] | undefined;
      if (Array.isArray(arr)) {
        for (const sub of arr) walk(sub, path);
      }
    }
    for (const keyword of ["if", "then", "else"] as const) {
      if (obj[keyword]) walk(obj[keyword], path);
    }
  }

  // Walk the root schema properties first
  walk(schema, "");

  // Then walk every $def so nested types are also indexed
  for (const defSchema of Object.values(defs)) {
    walk(defSchema, "");
  }

  return index;
}

export function getPropertyIndex(name: string, version: string): Map<string, string[]> {
  return _propertyIndexCache.get(`${name}:${version}`) ?? new Map();
}

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
  if (!_initPromise) {
    console.log("[schema] ensureLoaded() — first call, starting schema load");
    _initPromise = loadSchemas().catch((err) => {
      console.error("[schema] loadSchemas() threw unexpectedly:", err);
      _initPromise = null; // allow retry on next request
    });
  }
  return _initPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function getAvailableSchemas(): Promise<Record<string, string[]>> {
  return fetchOrReadJson(availablePath()) as Promise<Record<string, string[]>>;
}

export async function loadSchemas(): Promise<void> {
  console.log(`[schema] loadSchemas() starting — SCHEMA_LOCATION=${SCHEMA_LOCATION || "(not set)"}`);
  let loaded = 0;
  let failed = 0;
  const schemas = await getAvailableSchemas();
  console.log(`[schema] available schemas:`, JSON.stringify(schemas));
  for (const [name, versions] of Object.entries(schemas)) {
    for (const version of versions) {
      const key = `${name}:${version}`;
      try {
        const schema = await fetchOrReadJson(schemaPath(name, version));
        ajv.removeSchema(key);
        ajv.addSchema(schema as object, key);
        _propertyIndexCache.set(key, buildPropertyIndex(schema as object));
        _nameDiscriminatorCache.set(key, buildNameDiscriminatorMap(schema as object));
        console.log(`[schema] loaded ${key}`);
        loaded++;
      } catch (err) {
        console.error(`[schema] FAILED to load ${key} from ${schemaPath(name, version)}:`, err);
        failed++;
      }
    }
  }
  console.log(`[schema] loadSchemas() complete — ${loaded} loaded, ${failed} failed`);
}

export function getSchema(name: string, version: string) {
  return ajv.getSchema(`${name}:${version}`);
}

export async function validateMetadata(
  metadata: unknown,
  modelName: string,
  modelVersion: string
): Promise<unknown[]> {
  await ensureLoaded();
  const validator = getSchema(modelName, modelVersion);
  if (!validator) {
    const loaded = ajv.schemas ? Object.keys(ajv.schemas).filter(k => !k.startsWith("http")) : [];
    console.error(`[schema] validateMetadata: schema "${modelName}:${modelVersion}" not found. Currently loaded: [${loaded.join(", ")}]`);
    return [{ message: `Schema ${modelName}:${modelVersion} is not known` }];
  }
  const ok = validator(metadata);
  return ok ? [] : (validator.errors ?? []);
}

export async function validateMetadataSection(
  metadata: unknown,
  modelName: string,
  modelVersion: string,
  subsection: string
): Promise<unknown[]> {
  await ensureLoaded();
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
  await ensureLoaded();
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
