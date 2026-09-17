import { baseContentType, diffValues, type Diff } from "./compare";
import { requestBody, requestUrl, type Fixture } from "./corpus";

export const STATUS_PATH = "<status>";
export const CONTENT_TYPE_PATH = "<content-type>";

export interface ActualResponse {
  status: number;
  contentType: string | null;
  body: unknown;
  text: string;
}

export interface RuleVerdict {
  note: string;
  covers(diff: Diff): boolean;
}

export interface Rule {
  id: string;
  reason: string;
  expectedToFire: boolean;
  evaluate(fixture: Fixture, actual: ActualResponse, diffs: Diff[]): RuleVerdict | null;
}

export type Outcome = "exact" | "accepted" | "unexplained";

export interface CaseResult {
  fixture: Fixture;
  actual: ActualResponse;
  outcome: Outcome;
  rulesFired: string[];
  accepted: Diff[];
  unexplained: Diff[];
  ruleErrors: string[];
}

export async function fetchActual(baseUrl: string, fixture: Fixture): Promise<ActualResponse> {
  const body = requestBody(fixture);
  const init: RequestInit = { method: fixture.request.method };
  if (body !== undefined) {
    init.body = body;
    init.headers = { "Content-Type": fixture.request.contentType ?? "application/json" };
  }
  const res = await fetch(requestUrl(baseUrl, fixture), init);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    body: parsed,
    text,
  };
}

export function collectDiffs(fixture: Fixture, actual: ActualResponse): Diff[] {
  const diffs: Diff[] = [];
  if (fixture.response.status !== actual.status) {
    diffs.push({
      path: STATUS_PATH,
      kind: "value",
      expected: fixture.response.status,
      actual: actual.status,
    });
  }
  const expectedType = baseContentType(fixture.response.contentType);
  const actualType = baseContentType(actual.contentType);
  if (expectedType !== actualType) {
    diffs.push({
      path: CONTENT_TYPE_PATH,
      kind: "value",
      expected: expectedType,
      actual: actualType,
    });
  }
  diffs.push(...diffValues(fixture.response.body, actual.body, ""));
  return diffs;
}

export function classify(fixture: Fixture, actual: ActualResponse, rules: Rule[]): CaseResult {
  const diffs = collectDiffs(fixture, actual);
  if (diffs.length === 0) {
    return { fixture, actual, outcome: "exact", rulesFired: [], accepted: [], unexplained: [], ruleErrors: [] };
  }

  const rulesFired: string[] = [];
  const ruleErrors: string[] = [];
  const accepted: Diff[] = [];
  let remaining = diffs;

  for (const rule of rules) {
    if (remaining.length === 0) break;
    let verdict: RuleVerdict | null;
    try {
      verdict = rule.evaluate(fixture, actual, remaining);
    } catch (err) {
      ruleErrors.push(`${rule.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (verdict === null) continue;
    const covered = remaining.filter((d) => verdict.covers(d));
    if (covered.length === 0) continue;
    rulesFired.push(rule.id);
    accepted.push(...covered);
    remaining = remaining.filter((d) => !verdict.covers(d));
  }

  return {
    fixture,
    actual,
    outcome: remaining.length === 0 && ruleErrors.length === 0 ? "accepted" : "unexplained",
    rulesFired,
    accepted,
    unexplained: remaining,
    ruleErrors,
  };
}

export async function replay(
  baseUrl: string,
  fixtures: Fixture[],
  rules: Rule[],
  concurrency = 6
): Promise<CaseResult[]> {
  const results: CaseResult[] = new Array(fixtures.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= fixtures.length) return;
      const fixture = fixtures[index];
      const actual = await fetchActual(baseUrl, fixture);
      results[index] = classify(fixture, actual, rules);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, fixtures.length) }, worker));
  return results;
}
