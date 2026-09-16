import { formatDiff } from "./compare";
import type { Manifest } from "./corpus";
import type { CaseResult, Rule } from "./runner";

export type Rag = "green" | "amber" | "red";

export const RAG_ICON: Record<Rag, string> = {
  green: "🟢",
  amber: "🟡",
  red: "🔴",
};

export interface EndpointRow {
  endpoint: string;
  total: number;
  exact: number;
  accepted: number;
  unexplained: number;
  rules: string[];
  rag: Rag;
}

const endpointOf = (result: CaseResult): string =>
  `${result.fixture.request.method} ${result.fixture.request.path}`;

export function summarise(results: CaseResult[]): EndpointRow[] {
  const rows = new Map<string, EndpointRow>();
  for (const result of results) {
    const endpoint = endpointOf(result);
    const row =
      rows.get(endpoint) ??
      { endpoint, total: 0, exact: 0, accepted: 0, unexplained: 0, rules: [], rag: "green" as Rag };
    row.total += 1;
    row[result.outcome] += 1;
    for (const id of result.rulesFired) if (!row.rules.includes(id)) row.rules.push(id);
    rows.set(endpoint, row);
  }
  for (const row of rows.values()) {
    row.rules.sort();
    row.rag = row.unexplained > 0 ? "red" : row.accepted > 0 ? "amber" : "green";
  }
  return [...rows.values()].sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

const targetOf = (result: CaseResult): string => {
  const q = result.fixture.request.query ?? {};
  const schema = q.output_schema ?? q.input_schema ?? q.name ?? q.schema;
  const version = q.output_version ?? q.input_version ?? q.version;
  if (!schema) return "—";
  return version ? `${schema} ${version}` : String(schema);
};

export function summariseTargets(results: CaseResult[], endpoint: string): EndpointRow[] {
  return summarise(
    results
      .filter((r) => `${r.fixture.request.method} ${r.fixture.request.path}` === endpoint)
      .map((r) => ({ ...r, fixture: { ...r.fixture, request: { ...r.fixture.request, method: "", path: targetOf(r) } } }))
  );
}

const table = (rows: EndpointRow[], header: string): string => {
  const lines = [
    `| ${header} | Cases | Exact | Accepted | Unexplained | Rules | |`,
    "|---|---:|---:|---:|---:|---|:--:|",
  ];
  for (const row of rows) {
    lines.push(
      `| \`${row.endpoint.trim()}\` | ${row.total} | ${row.exact} | ${row.accepted} | ${row.unexplained} | ${row.rules.join(", ") || "—"} | ${RAG_ICON[row.rag]} |`
    );
  }
  return lines.join("\n");
};

export function renderReport(
  results: CaseResult[],
  rules: Rule[],
  manifest: Manifest,
  baseUrl: string
): string {
  const rows = summarise(results);
  const totals = {
    total: results.length,
    exact: results.filter((r) => r.outcome === "exact").length,
    accepted: results.filter((r) => r.outcome === "accepted").length,
    unexplained: results.filter((r) => r.outcome === "unexplained").length,
  };
  const overall: Rag = totals.unexplained > 0 ? "red" : totals.accepted > 0 ? "amber" : "green";

  const out: string[] = [];
  out.push("## Production parity matrix");
  out.push("");
  out.push(
    `Replayed **${totals.total}** golden fixtures captured from \`${manifest.traserBaseUrl}\` on ` +
      `${manifest.harvestedAt.slice(0, 10)} against the rewrite at \`${baseUrl}\`.`
  );
  out.push("");
  out.push(
    `${RAG_ICON.green} byte-for-byte identical to production · ` +
      `${RAG_ICON.amber} differs only by a named, accepted divergence · ` +
      `${RAG_ICON.red} unexplained difference`
  );
  out.push("");
  out.push(table(rows, "Endpoint"));
  out.push("");
  out.push(
    `**Overall ${RAG_ICON[overall]} — ${totals.exact} exact, ${totals.accepted} accepted divergence, ` +
      `${totals.unexplained} unexplained, across ${totals.total} calls.**`
  );

  const translateRows = summariseTargets(results, "POST /translate");
  if (translateRows.length > 0) {
    out.push("");
    out.push("### `POST /translate` by output schema");
    out.push("");
    out.push(table(translateRows, "Target"));
  }

  out.push("");
  out.push("### Accepted divergences");
  out.push("");
  out.push("| Rule | Fired | Why it is accepted |");
  out.push("|---|:--:|---|");
  for (const rule of rules) {
    const fired = results.filter((r) => r.rulesFired.includes(rule.id)).length;
    out.push(`| \`${rule.id}\` | ${fired} | ${rule.reason} |`);
  }

  const failures = results.filter((r) => r.outcome === "unexplained");
  if (failures.length > 0) {
    out.push("");
    out.push("### Unexplained differences");
    out.push("");
    for (const failure of failures) {
      out.push(`- \`${failure.fixture.id}\``);
      for (const ruleError of failure.ruleErrors) {
        out.push(`  - rule assertion failed — ${ruleError}`);
      }
      for (const diff of failure.unexplained.slice(0, 5)) {
        out.push(`  - ${formatDiff(diff)}`);
      }
      if (failure.unexplained.length > 5) {
        out.push(`  - …and ${failure.unexplained.length - 5} more`);
      }
    }
  }

  out.push("");
  return out.join("\n");
}
