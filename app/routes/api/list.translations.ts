/**
 * @openapi
 * /list/translations:
 *   get:
 *     tags: [list]
 *     summary: List reachable translation routes from a schema
 *     description: Returns all translation paths reachable from the given schema/version using Dijkstra's algorithm over the translation graph.
 *     parameters:
 *       - name: schema
 *         in: query
 *         required: true
 *         description: Source schema name (e.g. HDRUK).
 *         schema:
 *           type: string
 *           example: HDRUK
 *       - name: version
 *         in: query
 *         required: true
 *         description: Source schema version (e.g. 2.1.2).
 *         schema:
 *           type: string
 *           example: "2.1.2"
 *     responses:
 *       '200':
 *         description: Array of translation route strings.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["HDRUK:2.1.2 -> GWDM:1.0", "HDRUK:2.1.2 -> GWDM:1.0 -> SchemaOrg:1.0"]
 *       '400':
 *         description: Missing required parameters.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
import { ensureLoaded, getAvailableSchemas } from "~/lib/schema.server";
import { TranslationGraph } from "~/lib/graph.server";
import { publishMessage } from "~/lib/audit.server";
import { fieldError, invalidParams, type FieldError } from "~/lib/errors.server";

export async function loader({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const schema = url.searchParams.get("schema");
  const version = url.searchParams.get("version");

  const paramErrors: FieldError[] = [];
  if (!schema) paramErrors.push(fieldError("Invalid value", "schema", "query"));
  if (!version) paramErrors.push(fieldError("Invalid value", "version", "query"));
  if (paramErrors.length > 0) {
    publishMessage("GET", "list/translations", "Failed to retrieve available translations").catch(console.error);
    return invalidParams("Translation has failed.", paramErrors);
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
