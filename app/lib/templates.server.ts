import { readFile } from "fs/promises";
import { createFetchCache } from "./ttlCache.server";

const TEMPLATES_LOCATION = process.env.TEMPLATES_LOCATION ?? "";
const CACHE_TTL = parseInt(process.env.CACHE_REFRESH_STDTLL ?? "3600") * 1000;

// ─── I/O ──────────────────────────────────────────────────────────────────

// Loader throws on failure (rather than returning null) so the cache never
// stores a failed fetch — fetchOrReadText below is what converts that to null.
const fetchText = createFetchCache(async (url: string): Promise<string> => {
  if (url.startsWith("http")) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.text();
  }
  return readFile(url, "utf-8");
}, { ttlMs: CACHE_TTL });

async function fetchOrReadText(url: string): Promise<string | null> {
  try {
    return await fetchText(url);
  } catch {
    return null;
  }
}

async function fetchOrReadJson(url: string): Promise<unknown> {
  const text = await fetchOrReadText(url);
  if (!text) throw new Error(`Failed to fetch: ${url}`);
  return JSON.parse(text);
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
