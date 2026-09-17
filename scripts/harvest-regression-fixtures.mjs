#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MIN_NODE_MAJOR = 18;
const GATEWAY_TIMEOUT_MS = 60000;
const TRASER_TIMEOUT_MS = 60000;

const USAGE = `
harvest-regression-fixtures — capture golden request/response fixtures from
production TRASER, for the GAT-9016 Express -> React Router migration.

Usage:
  TRASER_PROD_URL=https://translate.healthdatagateway.org \\
    node scripts/harvest-regression-fixtures.mjs [options]

Options:
  --limit N            datasets to harvest            (default 4)
  --pool N             datasets to sample from        (default 250)
  --pid PID            harvest one specific dataset; requires --out
  --out DIR            output directory               (default tests/data/regression-fixtures)
  --concurrency N      parallel TRASER calls          (default 5)
  --max-input-bytes N  skip inputs larger than this   (default 250000)
  --exclude-pid PID=REASON
                       never harvest this pid; the reason is recorded in
                       index.json (repeatable)
  --help               print this and exit 0

Environment:
  TRASER_PROD_URL   required, e.g. https://translate.healthdatagateway.org
  GATEWAY_API_URL   optional, default https://api.prod.hdruk.cloud/api/v2

Every call this script makes is read-only: GET against the Gateway API, and
POST /find, /translate, /validate against TRASER, all three of which are pure
functions of the request body.
`;

function fail(message) {
  process.stderr.write(`harvest-regression-fixtures: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    limit: 4,
    pool: 250,
    pid: null,
    out: path.join("tests", "data", "regression-fixtures"),
    concurrency: 5,
    maxInputBytes: 250000,
    exclusions: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} requires a value`);
      return value;
    };
    switch (arg) {
      case "--help":
      case "-h":
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case "--limit": opts.limit = Number(next()); break;
      case "--pool": opts.pool = Number(next()); break;
      case "--pid": opts.pid = next(); break;
      case "--out": opts.out = next(); break;
      case "--concurrency": opts.concurrency = Number(next()); break;
      case "--max-input-bytes": opts.maxInputBytes = Number(next()); break;
      case "--exclude-pid": {
        const raw = next();
        const at = raw.indexOf("=");
        if (at < 1) fail(`--exclude-pid needs PID=REASON, got "${raw}" — an undocumented exclusion is indistinguishable from dropping an inconvenient failure`);
        opts.exclusions.push({ pid: raw.slice(0, at), reason: raw.slice(at + 1).trim() });
        break;
      }
      default: fail(`unknown option: ${arg}`);
    }
  }
  for (const key of ["limit", "pool", "concurrency", "maxInputBytes"]) {
    if (!Number.isInteger(opts[key]) || opts[key] <= 0) fail(`--${key} must be a positive integer`);
  }
  for (const { pid, reason } of opts.exclusions) {
    if (!reason) fail(`--exclude-pid ${pid}= needs a non-empty reason`);
  }
  const resolved = path.resolve(opts.out);
  if (resolved === path.parse(resolved).root || resolved === process.env.HOME) {
    fail(`--out ${resolved} is too broad to wipe safely`);
  }
  if (opts.pid && opts.out === path.join("tests", "data", "regression-fixtures")) {
    fail("--pid rebuilds the output directory from one dataset — pass --out to a scratch dir so it cannot replace the committed corpus");
  }
  return opts;
}

function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function slug(text) {
  return String(text).replace(/[^A-Za-z0-9._-]+/g, "_");
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

async function request(url, init, timeoutMs, attempt = 1) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (RETRYABLE_STATUS.has(res.status) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return request(url, init, timeoutMs, attempt + 1);
    }
    return { res, attempts: attempt };
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return request(url, init, timeoutMs, attempt + 1);
    }
    throw err;
  }
}

async function record(baseUrl, call, timeoutMs) {
  const qs = call.query ? `?${new URLSearchParams(call.query)}` : "";
  const url = `${baseUrl}${call.routePath}${qs}`;
  const init = { method: call.method };
  if (call.body !== undefined) {
    init.headers = { "Content-Type": call.contentType ?? "application/json" };
    init.body = typeof call.body === "string" ? call.body : JSON.stringify(call.body);
  }
  const { res, attempts } = await request(url, init, timeoutMs);
  const text = await res.text();
  let parsed;
  let parseError = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
    parseError = "response was not valid JSON";
  }
  return {
    request: {
      method: call.method,
      path: call.routePath,
      query: call.query ?? null,
      envelope: call.envelope ?? null,
      contentType: call.contentType ?? "application/json",
      bodyFrom: call.bodyFrom ?? null,
      inlineBody: call.inlineBody ?? null,
    },
    response: {
      status: res.status,
      contentType: res.headers.get("content-type") ?? null,
      body: parsed,
      ...(parseError ? { parseError, text } : {}),
      bodySha256: sha256(JSON.stringify(parsed)),
      rawSha256: sha256(text),
      bytes: Buffer.byteLength(text, "utf8"),
      attempts,
    },
  };
}

function dedupeByPid(records) {
  const byPid = new Map();
  for (const rec of records) {
    if (!rec.pid) continue;
    const existing = byPid.get(rec.pid);
    if (!existing || Number(rec.id) > Number(existing.id)) byPid.set(rec.pid, rec);
  }
  return [...byPid.values()];
}

async function fetchPool(gatewayUrl, poolSize, wantedPid, log) {
  const PER_PAGE = 25;
  const MAX_PAGES = 200;
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${gatewayUrl}/datasets?with_metadata=1&status=ACTIVE&per_page=${PER_PAGE}&page=${page}`;
    const { res } = await request(url, {}, GATEWAY_TIMEOUT_MS);
    if (!res.ok) {
      log(`gateway page ${page} returned HTTP ${res.status} — stopping pagination`);
      break;
    }
    let body;
    try {
      body = await res.json();
    } catch {
      log(`gateway page ${page} returned unparseable JSON — stopping pagination`);
      break;
    }
    if (!Array.isArray(body?.data) || body.data.length === 0) break;
    rows.push(...body.data);
    log(`gateway page ${page}/${body.last_page ?? "?"} — ${rows.length} rows`);
    if (wantedPid) {
      if (rows.some((row) => row.pid === wantedPid)) break;
    } else if (dedupeByPid(rows).length >= poolSize) break;
    if (!body.last_page || page >= body.last_page) break;
  }
  return dedupeByPid(rows);
}

function candidatesFrom(row) {
  const container = row?.latest_metadata?.metadata;
  if (!container) return [];
  const out = [];
  if (container.metadata) out.push({ pid: row.pid, source: "canonical", metadata: container.metadata });
  if (container.original_metadata) out.push({ pid: row.pid, source: "original", metadata: container.original_metadata });
  return out;
}

function shapeKey(metadata) {
  return Object.keys(metadata).sort().join(",");
}

function stratify(candidates, limit) {
  const buckets = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.source}|${shapeKey(candidate.metadata)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(candidate);
  }
  const bySize = [...buckets.values()].sort((a, b) => a.length - b.length);
  const ordered = [];
  for (let lo = 0, hi = bySize.length - 1; lo <= hi; lo++, hi--) {
    ordered.push(bySize[lo]);
    if (lo !== hi) ordered.push(bySize[hi]);
  }
  const picked = [];
  for (let round = 0; picked.length < limit; round++) {
    let progressed = false;
    for (const bucket of ordered) {
      if (round >= bucket.length) continue;
      picked.push(bucket[round]);
      progressed = true;
      if (picked.length >= limit) break;
    }
    if (!progressed) break;
  }
  return { picked, shapeCount: buckets.size };
}

const TRANSLATE_TARGETS = [
  { outputSchema: "GWDM", outputVersion: "2.0" },
  { outputSchema: "GWDM", outputVersion: "2.1" },
  { outputSchema: "SchemaOrg", outputVersion: "GoogleRecommended" },
  { outputSchema: "SchemaOrg", outputVersion: "default" },
  { outputSchema: "HDRUK", outputVersion: "2.1.2" },
  { outputSchema: "CRUK", outputVersion: "1.0.0" },
];

const EXTRA_FIXTURE = {
  version: "0.0.1",
  publisher: { contactPoint: "contact@example.com" },
};

const COMMON_CALLS = [
  { name: "status", outPath: "common/status.json", method: "GET", routePath: "/status" },
  { name: "list_schemas", outPath: "common/list-schemas.json", method: "GET", routePath: "/list/schemas" },
  { name: "list_templates", outPath: "common/list-templates.json", method: "GET", routePath: "/list/templates" },
  { name: "list_translations", outPath: "common/list-translations/HDRUK/2.1.2.json", method: "GET", routePath: "/list/translations", query: { schema: "HDRUK", version: "2.1.2" } },
  { name: "get_map", outPath: "common/get-map/HDRUK/2.1.2/to/GWDM/2.0.json", method: "GET", routePath: "/get/map", query: { input_schema: "HDRUK", input_version: "2.1.2", output_schema: "GWDM", output_version: "2.0" } },
  { name: "get_schema", outPath: "common/get-schema/GWDM/2.0.json", method: "GET", routePath: "/get/schema", query: { name: "GWDM", version: "2.0" } },
  { name: "get_form_hydration", outPath: "common/get-form-hydration/HDRUK/2.2.1.json", method: "GET", routePath: "/get/form_hydration", query: { name: "HDRUK", version: "2.2.1" } },

  { name: "err__get_schema__unknown", outPath: "common/err/get-schema-unknown.json", method: "GET", routePath: "/get/schema", query: { name: "NOPE", version: "9.9" } },
  { name: "err__get_schema__missing_name", outPath: "common/err/get-schema-missing-name.json", method: "GET", routePath: "/get/schema" },
  { name: "err__get_form_hydration__missing_name", outPath: "common/err/get-form-hydration-missing-name.json", method: "GET", routePath: "/get/form_hydration" },
  { name: "err__get_map__missing_params", outPath: "common/err/get-map-missing-params.json", method: "GET", routePath: "/get/map" },
  { name: "err__list_translations__missing_params", outPath: "common/err/list-translations-missing-params.json", method: "GET", routePath: "/list/translations" },
  { name: "err__translate__empty_body", outPath: "common/err/translate-empty-body.json", method: "POST", routePath: "/translate", query: { output_schema: "GWDM", output_version: "2.0" }, body: {}, envelope: "inline", inlineBody: {} },
  { name: "err__translate__metadata_not_object", outPath: "common/err/translate-metadata-not-object.json", method: "POST", routePath: "/translate", query: { output_schema: "GWDM", output_version: "2.0" }, body: { metadata: "not an object" }, envelope: "inline", inlineBody: { metadata: "not an object" } },
  { name: "err__translate__bad_validate_flag", outPath: "common/err/translate-bad-validate-flag.json", method: "POST", routePath: "/translate", query: { output_schema: "GWDM", output_version: "2.0", validate_input: "2" }, body: { metadata: { summary: { title: "x" } } }, envelope: "inline", inlineBody: { metadata: { summary: { title: "x" } } } },
  { name: "err__translate__extra_not_object", outPath: "common/err/translate-extra-not-object.json", method: "POST", routePath: "/translate", query: { output_schema: "GWDM", output_version: "2.0" }, body: { metadata: { summary: { title: "x" } }, extra: "nope" }, envelope: "inline", inlineBody: { metadata: { summary: { title: "x" } }, extra: "nope" } },
  { name: "err__validate__missing_query", outPath: "common/err/validate-missing-query.json", method: "POST", routePath: "/validate", body: { metadata: { summary: { title: "x" } } }, envelope: "inline", inlineBody: { metadata: { summary: { title: "x" } } } },
  { name: "err__validate__empty_body", outPath: "common/err/validate-empty-body.json", method: "POST", routePath: "/validate", query: { input_schema: "GWDM", input_version: "2.0" }, body: {}, envelope: "inline", inlineBody: {} },
  { name: "err__find__wrong_content_type", outPath: "common/err/find-wrong-content-type.json", method: "POST", routePath: "/find", body: "not json", contentType: "text/plain", envelope: "inline", inlineBody: "not json" },
  { name: "err__find__bad_with_errors", outPath: "common/err/find-bad-with-errors.json", method: "POST", routePath: "/find", query: { with_errors: "7" }, body: { summary: { title: "x" } }, envelope: "inline", inlineBody: { summary: { title: "x" } } },
];

function casesFor(candidate, detected) {
  const bodyFrom = `inputs/${slug(candidate.pid)}__${candidate.source}.json`;
  const bare = { envelope: "bare", bodyFrom, body: candidate.metadata };
  const wrapped = { envelope: "metadata", bodyFrom, body: { metadata: candidate.metadata } };
  const cases = [
    { name: "find", outDir: "find", method: "POST", routePath: "/find", ...bare },
    { name: "find__with_errors", outDir: "find/with-errors", method: "POST", routePath: "/find", query: { with_errors: "1" }, ...bare },
  ];
  for (const target of TRANSLATE_TARGETS) {
    cases.push({
      name: `translate__${target.outputSchema}_${target.outputVersion}`,
      outDir: `translate/${target.outputSchema}/${target.outputVersion}`,
      method: "POST",
      routePath: "/translate",
      query: { output_schema: target.outputSchema, output_version: target.outputVersion },
      ...wrapped,
    });
  }
  cases.push({
    name: "translate__GWDM_2.0__novalidate",
    outDir: "translate/GWDM/2.0/no-validate",
    method: "POST",
    routePath: "/translate",
    query: { output_schema: "GWDM", output_version: "2.0", validate_input: "0", validate_output: "0" },
    ...wrapped,
  });
  cases.push({
    name: "translate__HDRUK_2.1.2__no_first_matching",
    outDir: "translate/HDRUK/2.1.2/no-select-first-matching",
    method: "POST",
    routePath: "/translate",
    query: { output_schema: "HDRUK", output_version: "2.1.2", select_first_matching: "false" },
    ...wrapped,
  });
  cases.push({
    name: "translate__GWDM_2.0__subsection_summary",
    outDir: "translate/GWDM/2.0/subsection-summary",
    method: "POST",
    routePath: "/translate",
    query: { output_schema: "GWDM", output_version: "2.0", subsection: "summary" },
    ...wrapped,
  });
  cases.push({
    name: "translate__GWDM_2.0__with_extra",
    outDir: "translate/GWDM/2.0/with-extra",
    method: "POST",
    routePath: "/translate",
    query: { output_schema: "GWDM", output_version: "2.0" },
    envelope: "metadata+extra",
    bodyFrom,
    body: { metadata: candidate.metadata, extra: EXTRA_FIXTURE },
    inlineBody: { extra: EXTRA_FIXTURE },
  });
  const validateTarget = detected ?? { name: "HDRUK", version: "2.1.2" };
  cases.push({
    name: `validate__${validateTarget.name}_${validateTarget.version}`,
    outDir: `validate/${validateTarget.name}/${validateTarget.version}`,
    method: "POST",
    routePath: "/validate",
    query: { input_schema: validateTarget.name, input_version: validateTarget.version },
    ...wrapped,
  });
  cases.push({
    name: "validate__subsection_summary",
    outDir: `validate/${validateTarget.name}/${validateTarget.version}/subsection-summary`,
    method: "POST",
    routePath: "/validate",
    query: { input_schema: validateTarget.name, input_version: validateTarget.version, subsection: "summary" },
    ...wrapped,
  });
  return cases;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const CREDENTIAL_RE = /(authorization"?\s*[:=]|bearer\s+[a-z0-9._-]{8,}|set-cookie|api[_-]?key"?\s*[:=]|eyJ[a-z0-9_-]{10,})/gi;

async function scanDir(dir, re) {
  const hits = new Set();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const hit of await scanDir(full, re)) hits.add(hit);
      continue;
    }
    const text = await readFile(full, "utf8");
    for (const hit of text.match(re) ?? []) hits.add(hit.toLowerCase());
  }
  return hits;
}

async function main() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < MIN_NODE_MAJOR) fail(`Node ${MIN_NODE_MAJOR}+ required (global fetch, AbortSignal.timeout); running ${process.version}`);

  const opts = parseArgs(process.argv.slice(2));
  const traserUrl = (process.env.TRASER_PROD_URL ?? "").replace(/\/+$/, "");
  if (!traserUrl) fail("TRASER_PROD_URL is not set — refusing to guess the production TRASER base URL");
  const gatewayUrl = (process.env.GATEWAY_API_URL ?? "https://api.prod.hdruk.cloud/api/v2").replace(/\/+$/, "");

  const started = new Date().toISOString();
  const log = (message) => process.stdout.write(`[harvest] ${message}\n`);
  log(`TRASER  ${traserUrl}`);
  log(`Gateway ${gatewayUrl}`);

  const outDir = path.resolve(opts.out);
  const inputsDir = path.join(outDir, "inputs");
  const casesDir = path.join(outDir, "cases");

  const pool = await fetchPool(gatewayUrl, opts.pool, opts.pid, log);
  if (pool.length === 0) fail("gateway returned no ACTIVE datasets — leaving the existing fixtures untouched");

  const excluded = new Map(opts.exclusions.map((e) => [e.pid, e.reason]));
  const matchedPid = opts.pid ? pool.filter((row) => row.pid === opts.pid) : pool;
  if (opts.pid && matchedPid.length === 0) fail(`pid ${opts.pid} not found in the ACTIVE dataset pool`);
  const excludedHere = [];
  const scoped = matchedPid.filter((row) => {
    if (!excluded.has(row.pid)) return true;
    excludedHere.push({ pid: row.pid, reason: excluded.get(row.pid) });
    log(`skip ${row.pid} — excluded: ${excluded.get(row.pid)}`);
    return false;
  });
  if (scoped.length === 0) fail("every candidate dataset was excluded — nothing to harvest");

  await rm(inputsDir, { recursive: true, force: true });
  await rm(casesDir, { recursive: true, force: true });
  await mkdir(inputsDir, { recursive: true });
  await mkdir(casesDir, { recursive: true });

  const skippedNoMetadata = [];
  const skippedTooLarge = [];
  const candidates = [];
  for (const row of scoped) {
    const found = candidatesFrom(row);
    if (found.length === 0) {
      skippedNoMetadata.push(row.pid);
      log(`skip ${row.pid} — no metadata on the list record`);
      continue;
    }
    for (const candidate of found) {
      const bytes = Buffer.byteLength(JSON.stringify(candidate.metadata), "utf8");
      if (bytes > opts.maxInputBytes) {
        skippedTooLarge.push({ pid: row.pid, source: candidate.source, bytes });
        log(`skip ${row.pid} (${candidate.source}) — ${bytes} bytes exceeds --max-input-bytes ${opts.maxInputBytes}`);
        continue;
      }
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) fail("no candidate inputs survived filtering");

  const { picked, shapeCount } = opts.pid
    ? { picked: candidates, shapeCount: new Set(candidates.map((c) => shapeKey(c.metadata))).size }
    : stratify(candidates, opts.limit);
  log(`pool ${pool.length} datasets -> ${candidates.length} candidate inputs across ${shapeCount} shapes -> ${picked.length} selected`);

  const run = limiter(opts.concurrency);
  const manifestCases = [];
  const manifestInputs = [];

  const writeCase = async (fileName, payload) => {
    const target = path.join(casesDir, fileName);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    manifestCases.push({
      file: `cases/${fileName}`,
      method: payload.request.method,
      path: payload.request.path,
      query: payload.request.query,
      envelope: payload.request.envelope,
      bodyFrom: payload.request.bodyFrom,
      status: payload.response.status,
      bodySha256: payload.response.bodySha256,
      rawSha256: payload.response.rawSha256,
      responseBytes: payload.response.bytes,
      attempts: payload.response.attempts,
    });
  };

  log(`recording ${COMMON_CALLS.length} dataset-independent calls`);
  await Promise.all(
    COMMON_CALLS.map((call) =>
      run(async () => {
        const payload = await record(traserUrl, call, TRASER_TIMEOUT_MS);
        await writeCase(call.outPath, payload);
      })
    )
  );

  let recorded = 0;
  await Promise.all(
    picked.map((candidate) =>
      run(async () => {
        const stem = `${slug(candidate.pid)}__${candidate.source}`;
        const findPayload = await record(traserUrl, { method: "POST", routePath: "/find", envelope: "bare", bodyFrom: `inputs/${stem}.json`, body: candidate.metadata }, TRASER_TIMEOUT_MS);
        const matches = Array.isArray(findPayload.response.body)
          ? findPayload.response.body.filter((entry) => entry?.matches)
          : [];
        const detected = matches[0] ? { name: matches[0].name, version: matches[0].version } : null;

        const inputText = `${JSON.stringify(candidate.metadata, null, 2)}\n`;
        await writeFile(path.join(inputsDir, `${stem}.json`), inputText, "utf8");
        manifestInputs.push({
          file: `inputs/${stem}.json`,
          pid: candidate.pid,
          source: candidate.source,
          detected,
          allMatches: matches.map((entry) => `${entry.name}:${entry.version}`),
          sha256: sha256(inputText),
          bytes: Buffer.byteLength(inputText, "utf8"),
        });

        for (const call of casesFor(candidate, detected)) {
          const payload = call.name === "find" ? findPayload : await record(traserUrl, call, TRASER_TIMEOUT_MS);
          await writeCase(`${call.outDir}/${stem}.json`, payload);
        }
        recorded++;
        if (recorded % 10 === 0) log(`${recorded}/${picked.length} datasets recorded`);
      })
    )
  );

  manifestCases.sort((a, b) => a.file.localeCompare(b.file));
  manifestInputs.sort((a, b) => a.file.localeCompare(b.file));

  const statuses = {};
  for (const entry of manifestCases) statuses[entry.status] = (statuses[entry.status] ?? 0) + 1;
  const detectedSchemas = [...new Set(manifestInputs.map((i) => (i.detected ? `${i.detected.name}:${i.detected.version}` : "none")))].sort();
  const retried = manifestCases.filter((c) => c.attempts > 1);

  const manifest = {
    harvestedAt: started,
    completedAt: new Date().toISOString(),
    traserBaseUrl: traserUrl,
    gatewayApiUrl: gatewayUrl,
    harvesterNodeVersion: process.version,
    argv: process.argv.slice(2),
    options: {
      limit: opts.limit,
      pool: opts.pool,
      pid: opts.pid,
      concurrency: opts.concurrency,
      maxInputBytes: opts.maxInputBytes,
    },
    detectedInputSchemas: detectedSchemas,
    statusCounts: statuses,
    skipped: {
      excluded: excludedHere,
      noMetadata: skippedNoMetadata,
      tooLarge: skippedTooLarge,
    },
    retriedCases: retried.map((c) => ({ file: c.file, attempts: c.attempts, status: c.status })),
    inputs: manifestInputs,
    cases: manifestCases,
  };
  await writeFile(path.join(outDir, "index.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const emails = new Set([...(await scanDir(casesDir, EMAIL_RE)), ...(await scanDir(inputsDir, EMAIL_RE))]);
  const credentials = new Set([...(await scanDir(casesDir, CREDENTIAL_RE)), ...(await scanDir(inputsDir, CREDENTIAL_RE))]);

  log("");
  log(`datasets ${manifestInputs.length} · cases ${manifestCases.length}`);
  log(`skipped: ${excludedHere.length} excluded, ${skippedNoMetadata.length} no-metadata, ${skippedTooLarge.length} too-large`);
  log(`detected input schemas: ${detectedSchemas.join(", ")}`);
  log(`response statuses: ${Object.entries(statuses).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  const survivingServerErrors = manifestCases.filter((c) => c.status >= 500);
  if (survivingServerErrors.length > 0) {
    log(`WARNING: ${survivingServerErrors.length} cases recorded a ${">=500"} after retry — confirm these are deterministic prod faults, not transient blips, before freezing them as golden.`);
  }
  if (retried.length > 0) log(`NOTE: ${retried.length} cases needed a retry — see index.json retriedCases.`);
  if (credentials.size > 0) {
    log(`WARNING: credential-shaped strings found — do NOT commit until reviewed:`);
    for (const hit of [...credentials].sort()) log(`  credential: ${hit}`);
  }
  if (emails.size > 0) {
    log(`NOTE: ${emails.size} distinct email-shaped strings appear in the fixtures — review each before committing. Role/organisational mailboxes published on the Gateway are acceptable; named individuals are not. Drop a dataset with --exclude-pid <pid>="<reason>".`);
    for (const email of [...emails].sort()) log(`  email: ${email}`);
  }
  log(`written to ${outDir}`);
}

main().catch((err) => fail(err?.stack ?? String(err)));
