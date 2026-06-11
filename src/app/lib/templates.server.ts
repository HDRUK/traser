import { readFile } from "fs/promises";

const TEMPLATES_LOCATION = process.env.TEMPLATES_LOCATION ?? "";
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

async function fetchOrReadText(url: string): Promise<string | null> {
  const cached = getCached(url);
  if (cached !== undefined) return cached as string;

  try {
    let data: string;
    if (url.startsWith("http")) {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      data = await res.text();
    } else {
      data = await readFile(url, "utf-8");
    }
    setCached(url, data);
    return data;
  } catch {
    return null;
  }
}

async function fetchOrReadJson(url: string): Promise<unknown> {
  const cached = getCached(url);
  if (cached !== undefined) return cached;

  const text = await fetchOrReadText(url);
  if (!text) throw new Error(`Failed to fetch: ${url}`);

  const data = JSON.parse(text);
  setCached(url, data);
  return data;
}

// ─── Paths ────────────────────────────────────────────────────────────────

function templatePath(inModel: string, inVer: string, outModel: string, outVer: string): string {
  return `${TEMPLATES_LOCATION}/maps/${outModel}/${outVer}/${inModel}/${inVer}/translation.jsonata`;
}

function hydrationTemplatePath(model: string, version: string): string {
  return `${TEMPLATES_LOCATION}/maps/Hydration/${model}/${version}/translation.jsonata`;
}

function availablePath(): string {
  return `${TEMPLATES_LOCATION}/available.json`;
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface TemplateEntry {
  input_model: string;
  input_version: string;
  output_model: string;
  output_version: string;
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function getAvailableTemplates(): Promise<TemplateEntry[]> {
  return fetchOrReadJson(availablePath()) as Promise<TemplateEntry[]>;
}

export async function getTemplate(
  inModel: string,
  inVer: string,
  outModel: string,
  outVer: string
): Promise<string | null> {
  return fetchOrReadText(templatePath(inModel, inVer, outModel, outVer));
}

export async function getFormHydrationTemplate(model: string, version: string): Promise<string | null> {
  return fetchOrReadText(hydrationTemplatePath(model, version));
}

export async function loadTemplates(): Promise<void> {
  const templates = await getAvailableTemplates();
  await Promise.all(
    templates.map((t) =>
      getTemplate(t.input_model, t.input_version, t.output_model, t.output_version).catch(() => {})
    )
  );
}
