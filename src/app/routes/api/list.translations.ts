import { ensureLoaded, getAvailableSchemas } from "~/lib/schema.server";
import { TranslationGraph } from "~/lib/graph.server";
import { publishMessage } from "~/lib/audit.server";

export async function loader({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const schema = url.searchParams.get("schema");
  const version = url.searchParams.get("version");

  if (!schema || !version) {
    return Response.json(
      { message: "schema and version query params are required" },
      { status: 400 }
    );
  }

  const startNode = `${schema}:${version}`;
  const availableSchemas = await getAvailableSchemas();

  const allNodes: string[] = [];
  for (const [s, versions] of Object.entries(availableSchemas)) {
    for (const v of versions) allNodes.push(`${s}:${v}`);
  }

  const graph = await TranslationGraph.create();
  const predecessors = graph.dijkstra(startNode);

  const routes = allNodes
    .map((endNode) => {
      const { translationsToApply } = graph.getPath(startNode, endNode, predecessors);
      if (!translationsToApply) return null;
      return translationsToApply.map((e) => `${e.name}:${e.version}`).join(" -> ");
    })
    .filter((r): r is string => r !== null);

  publishMessage("GET", "list/translations", `Retrieved translations for ${schema}:${version}`).catch(console.error);
  return Response.json(routes);
}
