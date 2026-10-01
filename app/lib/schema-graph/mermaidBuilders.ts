import type { TemplateEntry } from "~/lib/templates.server";

const GROUP_CLASS: Record<string, string> = {
  HDRUK: "hdruk",
  GWDM: "gwdm",
};
function schemaClass(name: string): string {
  return GROUP_CLASS[name] ?? "schemaorg";
}

const MERMAID_HEADER = `flowchart LR
  classDef hdruk fill:#1565C0,stroke:#90caf9,color:#fff
  classDef gwdm fill:#2E7D32,stroke:#a5d6a7,color:#fff
  classDef schemaorg fill:#6A1B9A,stroke:#ce93d8,color:#fff
  classDef selected fill:#F57F17,stroke:#FFD54F,color:#000,stroke-width:3px`;

function nodeId(model: string, version: string): string {
  return `${model}_${version}`.replace(/[^a-zA-Z0-9_]/g, "_");
}
function nodeLabel(model: string, version: string): string {
  return `${model} ${version}`;
}

export function buildFullGraph(templates: TemplateEntry[]): string {
  const edges: string[] = [];
  const nodeLabels: Record<string, string> = {};
  const nodeByModel: Map<string, string[]> = new Map();
  const nodeClasses: Record<string, string> = {};
  const seenEdges = new Set<string>();

  for (const t of templates) {
    for (const [model, version] of [
      [t.input_model, t.input_version],
      [t.output_model, t.output_version],
    ] as [string, string][]) {
      const id = nodeId(model, version);
      if (!nodeLabels[id]) {
        nodeLabels[id] = nodeLabel(model, version);
        nodeClasses[id] = schemaClass(model);
        if (!nodeByModel.has(model)) nodeByModel.set(model, []);
        nodeByModel.get(model)!.push(id);
      }
    }
    const src = nodeId(t.input_model, t.input_version);
    const dst = nodeId(t.output_model, t.output_version);
    const key = `${src}-->${dst}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      edges.push(`  ${src} --> ${dst}`);
    }
  }

  const subgraphs = [...nodeByModel.entries()].map(([model, ids]) =>
    [
      `  subgraph ${model}`,
      ...ids.map((id) => `    ${id}["${nodeLabels[id]}"]`),
      "  end",
    ].join("\n"),
  );

  const classLines = Object.entries(nodeClasses).map(
    ([id, cls]) => `  class ${id} ${cls}`,
  );

  return [MERMAID_HEADER, ...subgraphs, ...edges, ...classLines].join("\n");
}

export function buildPathsGraph(
  paths: string[],
  selectedSchema: string,
  selectedVersion: string,
): string {
  const edgeLines: string[] = [];
  const nodeClasses: Record<string, string> = {};
  const seenEdges = new Set<string>();
  const seenNodeLabels: Record<string, string> = {};

  for (const path of paths) {
    const nodes = path.split(" -> ").map((n) => n.trim());
    for (const n of nodes) {
      const [model, version] = n.split(":");
      if (!model || !version) continue;
      const id = nodeId(model, version);
      seenNodeLabels[id] = nodeLabel(model, version);
      nodeClasses[id] = schemaClass(model);
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const [srcModel, srcVer] = nodes[i].split(":");
      const [dstModel, dstVer] = nodes[i + 1].split(":");
      if (!srcModel || !srcVer || !dstModel || !dstVer) continue;
      const src = nodeId(srcModel, srcVer);
      const dst = nodeId(dstModel, dstVer);
      const key = `${src}-->${dst}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edgeLines.push(
        `  ${src}["${seenNodeLabels[src] ?? nodes[i]}"] --> ${dst}["${seenNodeLabels[dst] ?? nodes[i + 1]}"]`,
      );
    }
  }

  const selId = nodeId(selectedSchema, selectedVersion);
  const classLines = Object.entries(nodeClasses).map(
    ([id, cls]) => `  class ${id} ${id === selId ? "selected" : cls}`,
  );

  return [MERMAID_HEADER, ...edgeLines, ...classLines].join("\n");
}
