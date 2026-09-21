import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";

// Load every fixture in tests/data/ keyed by filename (no extension) — matches
// the old `sampleMetadata` shape from examples.js
const dataDir = path.join(__dirname, "data");
export const sampleMetadata: Record<string, unknown> = {};
for (const file of readdirSync(dataDir)) {
  if (file.endsWith(".json")) {
    const key = path.parse(file).name;
    sampleMetadata[key] = JSON.parse(readFileSync(path.join(dataDir, file), "utf-8"));
  }
}

export function deepClone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

interface TranslateOptions {
  metadata: unknown;
  inputModel?: string;
  inputModelVersion?: string;
  outputModel?: string;
  outputModelVersion?: string;
  validateInput?: string;
  validateOutput?: string;
  extra?: unknown;
  subsection?: string;
}

export async function translate(opts: TranslateOptions) {
  const body: Record<string, unknown> = { metadata: opts.metadata };
  if (opts.extra != null) body.extra = opts.extra;

  const params = new URLSearchParams();
  if (opts.outputModel) params.set("output_schema", opts.outputModel);
  if (opts.outputModelVersion) params.set("output_version", opts.outputModelVersion);
  if (opts.inputModel) params.set("input_schema", opts.inputModel);
  if (opts.inputModelVersion) params.set("input_version", opts.inputModelVersion);
  params.set("validate_input", opts.validateInput ?? "1");
  params.set("validate_output", opts.validateOutput ?? "1");
  if (opts.subsection) params.set("subsection", opts.subsection);

  const res = await fetch(`${BASE_URL}/translate?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseBody = await res.json().catch(() => null);
  return { status: res.status, body: responseBody };
}

interface ValidateOptions {
  metadata: unknown;
  modelName: string;
  modelVersion: string;
  subsection?: string;
}

export async function validate(opts: ValidateOptions) {
  const params = new URLSearchParams({
    input_schema: opts.modelName,
    input_version: opts.modelVersion,
  });
  if (opts.subsection) params.set("subsection", opts.subsection);

  const res = await fetch(`${BASE_URL}/validate?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata: opts.metadata }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
