import { readFile } from "fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createFetchCache } from "./ttlCache.server";

const SCHEMA_LOCATION = process.env.SCHEMA_LOCATION ?? "";
const CACHE_TTL = parseInt(process.env.CACHE_REFRESH_STDTLL ?? "3600") * 1000;

const fetchOrReadJson = createFetchCache(async (url: string): Promise<unknown> => {
  if (url.startsWith("http")) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.json();
  }
  return JSON.parse(await readFile(url, "utf-8"));
}, { ttlMs: CACHE_TTL });

function createAjv(): Ajv {
  const instance = new Ajv({
    strict: false,
    strictSchema: false,
    strictTypes: false,
    allErrors: true,
    coerceTypes: true,
    useDefaults: true,
  });
  addFormats(instance);
  return instance;
}

let ajv = createAjv();

let _propertyIndexCache = new Map<string, Map<string, string[]>>();

let _nameDiscriminatorCache = new Map<string, Map<string, unknown[]>>();

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

    if (!nameProp["Literal"]) continue;
    const nameDefault = nameProp["default"] as string | undefined;
    if (!nameDefault) continue;

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

export function buildPropertyIndex(schema: object): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const defs: Record<string, object> =
    (schema as Record<string, unknown>)["$defs"] as Record<string, object> ??
    (schema as Record<string, unknown>)["definitions"] as Record<string, object> ??
    {};

  function resolveRef(ref: string): object | undefined {

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

    if (typeof obj["$ref"] === "string") {
      const target = resolveRef(obj["$ref"]);
      if (target) walk(target, path);
      return;
    }

    const props = obj["properties"] as Record<string, unknown> | undefined;
    if (props) {
      for (const [propName, propSchema] of Object.entries(props)) {
        const childPath = path ? `${path}.${propName}` : propName;

        const existing = index.get(propName);
        if (existing) {
          existing.push(childPath);
        } else {
          index.set(propName, [childPath]);
        }

        walk(propSchema, childPath);
      }
    }

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

  walk(schema, "");

  for (const defSchema of Object.values(defs)) {
    walk(defSchema, "");
  }

  return index;
}

export function getPropertyIndex(name: string, version: string): Map<string, string[]> {
  return _propertyIndexCache.get(`${name}:${version}`) ?? new Map();
}

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

let _initPromise: Promise<void> | null = null;

export function ensureLoaded(): Promise<void> {
  if (!_initPromise) {
    console.log("[schema] ensureLoaded() — first call, starting schema load");
    _initPromise = loadSchemas().catch((err) => {
      console.error("[schema] loadSchemas() threw unexpectedly:", err);
      _initPromise = null;
    });
  }
  return _initPromise;
}

export async function getAvailableSchemas(): Promise<Record<string, string[]>> {
  return fetchOrReadJson(availablePath()) as Promise<Record<string, string[]>>;
}

export interface SchemaLoadStatus {
  loaded: number;
  failed: number;
  failedKeys: string[];
  lastLoadedAt: string | null;
}

let _loadStatus: SchemaLoadStatus = {
  loaded: 0,
  failed: 0,
  failedKeys: [],
  lastLoadedAt: null,
};

export function getSchemaLoadStatus(): SchemaLoadStatus {
  return { ..._loadStatus, failedKeys: [..._loadStatus.failedKeys] };
}

export async function loadSchemas(): Promise<void> {
  console.log(`[schema] loadSchemas() starting — SCHEMA_LOCATION=${SCHEMA_LOCATION || "(not set)"}`);

  const nextAjv = createAjv();
  const nextPropertyIndex = new Map<string, Map<string, string[]>>();
  const nextNameDiscriminator = new Map<string, Map<string, unknown[]>>();

  let loaded = 0;
  let failed = 0;
  const failedKeys: string[] = [];

  const schemas = await getAvailableSchemas();
  console.log("[schema] available schemas:", JSON.stringify(schemas));
  for (const [name, versions] of Object.entries(schemas)) {
    for (const version of versions) {
      const key = `${name}:${version}`;
      try {
        const schema = await fetchOrReadJson(schemaPath(name, version));
        nextAjv.addSchema(schema as object, key);
        nextPropertyIndex.set(key, buildPropertyIndex(schema as object));
        nextNameDiscriminator.set(key, buildNameDiscriminatorMap(schema as object));
        console.log(`[schema] loaded ${key}`);
        loaded++;
      } catch (err) {
        console.error(`[schema] FAILED to load ${key} from ${schemaPath(name, version)}:`, err);
        failed++;
        failedKeys.push(key);
      }
    }
  }

  if (loaded === 0 && ajv && _loadStatus.lastLoadedAt) {
    console.error(
      `[schema] loadSchemas() loaded 0 of ${loaded + failed} — keeping previous store`
    );
    _loadStatus = { ..._loadStatus, failed, failedKeys };
    return;
  }

  ajv = nextAjv;
  _propertyIndexCache = nextPropertyIndex;
  _nameDiscriminatorCache = nextNameDiscriminator;
  _loadStatus = { loaded, failed, failedKeys, lastLoadedAt: new Date().toISOString() };

  if (failed > 0) {
    console.warn(
      `[schema] loadSchemas() complete with GAPS — ${loaded} loaded, ${failed} FAILED: [${failedKeys.join(", ")}]`
    );
  } else {
    console.log(`[schema] loadSchemas() complete — ${loaded} loaded, 0 failed`);
  }
}

let _reloaderStarted = false;

export function startSchemaReloader(): void {
  if (_reloaderStarted) return;
  _reloaderStarted = true;
  if (CACHE_TTL <= 0) {
    console.log("[schema] CACHE_REFRESH_STDTLL <= 0 — periodic schema reload disabled");
    return;
  }
  const timer = setInterval(() => {
    loadSchemas().catch((err) => console.error("[schema] periodic reload failed:", err));
  }, CACHE_TTL);
  timer.unref?.();
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
  if (!section)
    return [{ message: `Subsection ${subsection} not found in provided metadata.` }];
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
