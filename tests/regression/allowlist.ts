import type { Diff } from "./compare";
import type { Rule } from "./runner";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const looksLikeAjvError = (value: unknown): boolean =>
  isObject(value) && "instancePath" in value && "keyword" in value;

const at = (root: unknown, path: string[]): unknown =>
  path.reduce<unknown>((node, key) => {
    if (Array.isArray(node)) return node[Number(key)];
    if (isObject(node)) return node[key];
    return undefined;
  }, root);

function ajvArrayPaths(value: unknown, base: string[] = []): string[][] {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(looksLikeAjvError)) return [base];
    return value.flatMap((item, index) => ajvArrayPaths(item, [...base, String(index)]));
  }
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, item]) => ajvArrayPaths(item, [...base, key]));
  }
  return [];
}

const toDiffPath = (segments: string[]): string =>
  segments.reduce((acc, segment) => {
    if (/^\d+$/.test(segment)) return `${acc}[${segment}]`;
    return acc === "" ? segment : `${acc}.${segment}`;
  }, "");

const under = (prefixes: string[]) => (diff: Diff) =>
  prefixes.some((prefix) => diff.path === prefix || diff.path.startsWith(`${prefix}[`) || diff.path.startsWith(`${prefix}.`));

const canonical = (value: unknown): string => JSON.stringify(value);

/**
 * AJV runs with `allErrors: true`, so every validation-error array the rewrite
 * returns is a superset of the one Express recorded. Containment is asserted
 * per array — a production entry that has disappeared is still a failure.
 */
export const RULE_AJV_ALL_ERRORS: Rule = {
  id: "AJV_ALL_ERRORS",
  reason:
    "AJV now runs with `allErrors: true`, so validation-error arrays are complete rather than truncated at the first failure. Every entry production reported is asserted to still be present.",
  expectedToFire: true,
  evaluate(fixture, actual, diffs) {
    const paths = ajvArrayPaths(fixture.response.body);
    if (paths.length === 0) return null;

    const covered: string[] = [];
    for (const segments of paths) {
      const diffPath = toDiffPath(segments);
      if (!diffs.some(under([diffPath]))) continue;
      const expectedArray = at(fixture.response.body, segments) as unknown[];
      const actualArray = at(actual.body, segments);
      if (!Array.isArray(actualArray)) continue;
      if (actualArray.length < expectedArray.length) continue;
      const actualSet = new Set(actualArray.map(canonical));
      const missing = expectedArray.filter((entry) => !actualSet.has(canonical(entry)));
      if (missing.length > 0) {
        throw new Error(
          `${fixture.id}: ${toDiffPath(segments) || "<root>"} lost ${missing.length} validation error(s) ` +
            `that production reported, e.g. ${canonical(missing[0])}. allErrors only ever adds entries, so this is a regression.`
        );
      }
      covered.push(diffPath);
    }
    if (covered.length === 0) return null;

    const covers = under(covered);
    if (!diffs.some(covers)) return null;
    return { note: `${covered.length} validation-error array(s) grew`, covers };
  },
};

/**
 * `select_first_matching=false` was dead in Express — the query string was
 * never coerced, so the truthy string "false" kept the first match. The
 * rewrite honours it and rejects ambiguous input.
 */
export const RULE_SELECT_FIRST_MATCHING_FALSE: Rule = {
  id: "SELECT_FIRST_MATCHING_FALSE",
  reason:
    "`select_first_matching=false` was dead code in Express (the query string was never coerced to a boolean). The rewrite honours it and rejects input that matches more than one schema.",
  expectedToFire: true,
  evaluate(fixture, actual) {
    if (fixture.request.query?.select_first_matching !== "false") return null;
    if (actual.status !== 400) return null;
    const message = isObject(actual.body) ? actual.body.message : undefined;
    if (message !== "Input metadata object matched multiple schemas! Something could be wrong..") {
      return null;
    }
    return {
      note: "ambiguous input rejected instead of silently taking the first match",
      covers: () => true,
    };
  },
};

/**
 * Express leaked an internal TypeError for an unknown schema. The rewrite
 * answers with the same status and a clean message.
 */
export const RULE_GET_SCHEMA_UNKNOWN: Rule = {
  id: "GET_SCHEMA_UNKNOWN",
  reason:
    "Express leaked `Cannot read properties of undefined (reading 'schema')` for an unknown schema. The rewrite returns the same 400 with a clean `Schema <name>:<version> not found`.",
  expectedToFire: true,
  evaluate(fixture, actual) {
    if (fixture.request.path !== "/get/schema") return null;
    const expected = isObject(fixture.response.body) ? fixture.response.body.error : undefined;
    if (typeof expected !== "string" || !expected.startsWith("Cannot read properties")) return null;

    const name = fixture.request.query?.name;
    const version = fixture.request.query?.version;
    const wanted = `Schema ${name}:${version} not found`;
    const got = isObject(actual.body) ? actual.body.error : undefined;
    if (got !== wanted) {
      throw new Error(`${fixture.id}: expected error "${wanted}", got ${canonical(got)}`);
    }
    if (actual.status !== fixture.response.status) {
      throw new Error(`${fixture.id}: status changed ${fixture.response.status} → ${actual.status}`);
    }
    return { note: "internal TypeError replaced by a clean message", covers: (d) => d.path === "error" };
  },
};

/**
 * `/get/map` gained `translation_path` and `translation_maps` so a caller can
 * see the multi-hop chain that produces a pair with no direct map. Both are
 * additive; every field production returned is unchanged.
 */
export const RULE_GET_MAP_MULTI_HOP: Rule = {
  id: "GET_MAP_MULTI_HOP",
  reason:
    "`/get/map` keeps every field production returned and adds `translation_path` + `translation_maps`, so a pair with no direct map exposes the chain that TRASER would actually apply instead of just `translation_map: null`.",
  expectedToFire: true,
  evaluate(fixture, actual, diffs) {
    if (fixture.request.path !== "/get/map") return null;
    const additive = ["translation_path", "translation_maps"];
    const relevant = diffs.filter((d) => additive.includes(d.path) && d.kind === "extra");
    if (relevant.length === 0) return null;

    const body = isObject(actual.body) ? actual.body : {};
    const path = body.translation_path;
    const maps = body.translation_maps;
    const start = `${fixture.request.query?.input_schema}:${fixture.request.query?.input_version}`;
    const end = `${fixture.request.query?.output_schema}:${fixture.request.query?.output_version}`;

    if (body.translation_map === null && path !== null) {
      if (!Array.isArray(path) || path.length < 2 || path[0] !== start || path[path.length - 1] !== end) {
        throw new Error(`${fixture.id}: translation_path is not a chain from ${start} to ${end}: ${canonical(path)}`);
      }
      if (!Array.isArray(maps) || maps.length !== path.length - 1) {
        throw new Error(
          `${fixture.id}: translation_maps has ${Array.isArray(maps) ? maps.length : "no"} entries for a ${path.length}-node path`
        );
      }
    }
    return { note: "multi-hop chain exposed additively", covers: (d) => additive.includes(d.path) && d.kind === "extra" };
  },
};


/**
 * The corpus records production, whose SCHEMA_LOCATION / TEMPLATES_LOCATION
 * revisions cannot be read from outside the cluster. These five CRUK cases are
 * the residue: production's GWDM → CRUK chain left `identifier` unset, the
 * pinned revisions fill it. Re-derived by running the same corpus against the
 * Express service on identical pins — it produces byte-identical bodies to the
 * rewrite for all five — so this is upstream configuration, not the rewrite.
 * See `tests/regression/README.md`.
 */
const UPSTREAM_DRIFT_CASES = new Set([
  "translate/CRUK/1.0.0/337bac53-6b11-425b-0000-00000000097c__original",
  "translate/CRUK/1.0.0/464e1bea-54e5-3271-0000-00000009ec72__original",
  "translate/CRUK/1.0.0/bef024b9-1064-43b2-b347-1ac1b68ae575__canonical",
  "translate/CRUK/1.0.0/bef024b9-1064-43b2-b347-1ac1b68ae575__original",
  "translate/CRUK/1.0.0/ec36dc1f-8852-4398-ae54-cbe4a6053c6a__original",
]);

const IDENTIFIER_REQUIRED = {
  instancePath: "",
  schemaPath: "#/required",
  keyword: "required",
  params: { missingProperty: "identifier" },
  message: "must have required property 'identifier'",
};

export const RULE_UPSTREAM_REVISION_DRIFT: Rule = {
  id: "UPSTREAM_REVISION_DRIFT",
  reason:
    "Production's schemata-2 / traser-mapping-files revisions are not knowable from outside the cluster. On these five CRUK cases the pinned revisions populate `identifier`, so production's one validation error no longer applies. The Express service on identical pins returns the same body as the rewrite, so this is upstream configuration rather than a rewrite regression.",
  expectedToFire: true,
  evaluate(fixture, actual, diffs) {
    if (!UPSTREAM_DRIFT_CASES.has(fixture.id)) return null;
    if (!diffs.some(under(["details"]))) return null;

    if (actual.status !== fixture.response.status) return null;
    const body = isObject(actual.body) ? actual.body : {};
    if (body.message !== "Output metadata validation failed") return null;
    if (!Array.isArray(body.details) || body.details.length === 0) return null;

    const expected = isObject(fixture.response.body) ? fixture.response.body.details : undefined;
    const actualSet = new Set((body.details as unknown[]).map(canonical));
    const lost = (expected as unknown[]).filter((entry) => !actualSet.has(canonical(entry)));
    const unexpected = lost.filter((entry) => canonical(entry) !== canonical(IDENTIFIER_REQUIRED));
    if (unexpected.length > 0) {
      throw new Error(
        `${fixture.id}: production reported validation error(s) beyond the known \`identifier\` drift, ` +
          `e.g. ${canonical(unexpected[0])}. Re-derive this rule against the Express service before widening it.`
      );
    }
    return { note: "`identifier` populated by the pinned upstream revisions", covers: under(["details"]) };
  },
};

export const RULES: Rule[] = [
  RULE_UPSTREAM_REVISION_DRIFT,
  RULE_AJV_ALL_ERRORS,
  RULE_SELECT_FIRST_MATCHING_FALSE,
  RULE_GET_SCHEMA_UNKNOWN,
  RULE_GET_MAP_MULTI_HOP,
];
