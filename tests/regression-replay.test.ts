import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { formatDiff } from "./regression/compare";
import { loadCorpus, loadManifest, type Fixture, type Manifest } from "./regression/corpus";
import { renderReport } from "./regression/matrix";
import { RULES } from "./regression/allowlist";
import { replay, type CaseResult } from "./regression/runner";
import { BASE_URL } from "./helpers";

const REPORT_PATH = process.env.REGRESSION_MATRIX_OUT ?? "build/regression-matrix.md";

let manifest: Manifest;
let fixtures: Fixture[];
let results: CaseResult[];

beforeAll(async () => {
  manifest = loadManifest();
  fixtures = loadCorpus(manifest);
  results = await replay(BASE_URL, fixtures, RULES);
  const report = renderReport(results, RULES, manifest, BASE_URL);
  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`\n${report}`);
}, 300_000);

describe("production regression replay", () => {
  it("fixture corpus is non-empty", () => {
    if (process.env.ALLOW_NO_FIXTURES === "1") return;
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it("server is running against the baseline upstream revisions", () => {
    const BASELINE = ["common/list-schemas", "common/list-templates", "common/list-translations/HDRUK/2.1.2"];
    const drifted = results
      .filter((r) => BASELINE.includes(r.fixture.id) && r.outcome !== "exact")
      .map((r) => r.fixture.id);
    expect(
      drifted,
      "the schema/template set on this server is not the one the fixtures were harvested against — " +
        "run `node scripts/apply-regression-pins.mjs .env` and restart the server. Every other " +
        "difference in this suite is uninterpretable until this passes."
    ).toEqual([]);
  });

  it("every difference from production is a named, accepted divergence", () => {
    const failures = results.filter((r) => r.outcome === "unexplained");
    const detail = failures
      .map((f) => `${f.fixture.id}\n    ${[...f.ruleErrors, ...f.unexplained.map(formatDiff)].join("\n    ")}`)
      .join("\n  ");
    expect(detail, `${failures.length} fixture(s) differ from production for no allow-listed reason:\n  ${detail}`).toBe("");
  });

  it("every allow-list rule fires exactly as declared", () => {
    const declared = RULES.map((rule) => ({
      id: rule.id,
      expected: rule.expectedToFire,
      actual: results.some((r) => r.rulesFired.includes(rule.id)),
    }));
    const wrong = declared.filter((d) => d.expected !== d.actual);
    expect(
      wrong.map((d) => `${d.id}: declared expectedToFire=${d.expected}, observed ${d.actual}`),
      "an allow-list rule no longer matches its declaration — the corpus or the code has drifted"
    ).toEqual([]);
  });
});
