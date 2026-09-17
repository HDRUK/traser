import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_DIR = path.join(__dirname, "..", "data", "regression-fixtures");

export type Envelope = "bare" | "metadata" | "metadata+extra" | "inline";

export interface FixtureRequest {
  method: string;
  path: string;
  query: Record<string, string> | null;
  envelope: Envelope | null;
  contentType?: string;
  bodyFrom: string | null;
  inlineBody: unknown;
}

export interface FixtureResponse {
  status: number;
  contentType: string | null;
  body: unknown;
  bodySha256: string;
  rawSha256: string;
  bytes: number;
  attempts: number;
}

export interface Fixture {
  id: string;
  request: FixtureRequest;
  response: FixtureResponse;
}

export interface Manifest {
  harvestedAt: string;
  traserBaseUrl: string;
  cases: { file: string; bodySha256: string }[];
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

export function loadManifest(): Manifest {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, "index.json"), "utf8")) as Manifest;
}

export function loadCorpus(manifest: Manifest): Fixture[] {
  return manifest.cases.map((entry) => {
    const fixture = JSON.parse(
      readFileSync(path.join(FIXTURE_DIR, entry.file), "utf8")
    ) as Omit<Fixture, "id">;
    const recomputed = sha256(JSON.stringify(fixture.response.body));
    if (recomputed !== entry.bodySha256) {
      throw new Error(
        `${entry.file}: recorded body no longer hashes to index.json (${entry.bodySha256} vs ${recomputed}). ` +
          `The fixture has been edited by hand or the manifest is stale — re-harvest rather than adjusting either.`
      );
    }
    return { id: entry.file.replace(/^cases\//, "").replace(/\.json$/, ""), ...fixture };
  });
}

export function requestBody(fixture: Fixture): string | undefined {
  const { envelope, bodyFrom, inlineBody } = fixture.request;
  if (envelope === null) return undefined;
  if (envelope === "inline") {
    return typeof inlineBody === "string" ? inlineBody : JSON.stringify(inlineBody);
  }
  if (bodyFrom === null) {
    throw new Error(`${fixture.id}: envelope "${envelope}" needs a bodyFrom`);
  }
  const input = JSON.parse(readFileSync(path.join(FIXTURE_DIR, bodyFrom), "utf8")) as unknown;
  if (envelope === "bare") return JSON.stringify(input);
  if (envelope === "metadata") return JSON.stringify({ metadata: input });
  if (envelope === "metadata+extra") {
    const extra = (inlineBody as { extra?: unknown } | null)?.extra;
    return JSON.stringify({ metadata: input, extra });
  }
  throw new Error(`${fixture.id}: unknown envelope "${envelope}"`);
}

export function requestUrl(baseUrl: string, fixture: Fixture): string {
  const url = new URL(fixture.request.path, baseUrl);
  for (const [key, value] of Object.entries(fixture.request.query ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}
