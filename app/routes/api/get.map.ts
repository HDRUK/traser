/**
 * @openapi
 * /get/map:
 *   get:
 *     tags: [get]
 *     summary: Fetch a JSONata translation map
 *     description: Returns the raw JSONata template string used to translate between two specific schema/version pairs.
 *     parameters:
 *       - name: input_schema
 *         in: query
 *         required: true
 *         description: Source schema name.
 *         schema:
 *           type: string
 *           example: HDRUK
 *       - name: input_version
 *         in: query
 *         required: true
 *         description: Source schema version.
 *         schema:
 *           type: string
 *           example: "2.1.2"
 *       - name: output_schema
 *         in: query
 *         required: true
 *         description: Target schema name.
 *         schema:
 *           type: string
 *           example: GWDM
 *       - name: output_version
 *         in: query
 *         required: true
 *         description: Target schema version.
 *         schema:
 *           type: string
 *           example: "1.0"
 *     responses:
 *       '200':
 *         description: Translation map details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 input_schema:
 *                   type: string
 *                 input_version:
 *                   type: string
 *                 output_schema:
 *                   type: string
 *                 output_version:
 *                   type: string
 *                 translation_map:
 *                   type: string
 *                   description: The JSONata template string.
 *       '400':
 *         description: Translation not found or missing parameters.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
import { getTemplate } from "~/lib/templates.server";
import { TranslationGraph } from "~/lib/graph.server";
import { publishMessage } from "~/lib/audit.server";
import {
  fieldError,
  invalidParams,
  type FieldError,
} from "~/lib/errors.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const inputSchema = url.searchParams.get("input_schema");
  const inputVersion = url.searchParams.get("input_version");
  const outputSchema = url.searchParams.get("output_schema");
  const outputVersion = url.searchParams.get("output_version");

  // Order matches Express's query([...]) list (src/routes/get.js:55-58) so
  // errors[] comes back in the same sequence.
  const paramErrors: FieldError[] = [];
  if (!outputSchema)
    paramErrors.push(fieldError("Invalid value", "output_schema", "query"));
  if (!outputVersion)
    paramErrors.push(fieldError("Invalid value", "output_version", "query"));
  if (!inputSchema)
    paramErrors.push(fieldError("Invalid value", "input_schema", "query"));
  if (!inputVersion)
    paramErrors.push(fieldError("Invalid value", "input_version", "query"));
  if (paramErrors.length > 0) {
    publishMessage(
      "GET",
      "get/map",
      "Failed to retrieve mapping due to invalid inputs",
    ).catch(console.error);
    return invalidParams("Invalid query parameters.", paramErrors);
  }

  const template = await getTemplate(
    inputSchema!,
    inputVersion!,
    outputSchema!,
    outputVersion!,
  );

  // A pair with no direct map is not an error — production answered 200 with
  // translation_map: null. Most such pairs are still reachable by chaining
  // templates, so resolve the route and return each hop's map alongside.
  const { path, maps } = template
    ? { path: null, maps: null }
    : await resolveMultiHop(
        `${inputSchema}:${inputVersion}`,
        `${outputSchema}:${outputVersion}`,
      );

  publishMessage(
    "GET",
    "get/map",
    `Map ${inputSchema}-${inputVersion} → ${outputSchema}-${outputVersion} retrieved`,
  ).catch(console.error);
  return Response.json({
    input_schema: inputSchema,
    input_version: inputVersion,
    output_schema: outputSchema,
    output_version: outputVersion,
    translation_map: template ?? null,
    translation_path: path,
    translation_maps: maps,
  });
}

interface HopMap {
  from: string;
  to: string;
  map: string;
}

async function resolveMultiHop(
  from: string,
  to: string,
): Promise<{ path: string[] | null; maps: HopMap[] | null }> {
  let hops: { name: string; version: string }[];
  try {
    const graph = await TranslationGraph.create();
    const result = graph.getPath(from, to, graph.dijkstra(from));
    const found = (result as { translationsToApply?: { name: string; version: string }[] })
      .translationsToApply;
    if (!found || found.length < 2) return { path: null, maps: null };
    hops = found;
  } catch {
    return { path: null, maps: null };
  }

  const maps: HopMap[] = [];
  for (let i = 1; i < hops.length; i++) {
    const a = hops[i - 1];
    const b = hops[i];
    const hopTemplate = await getTemplate(a.name, a.version, b.name, b.version);
    // A hop the graph claims exists but whose template will not load makes the
    // whole chain unusable, so report no route rather than a partial one.
    if (!hopTemplate) return { path: null, maps: null };
    maps.push({
      from: `${a.name}:${a.version}`,
      to: `${b.name}:${b.version}`,
      map: hopTemplate,
    });
  }

  return { path: hops.map((h) => `${h.name}:${h.version}`), maps };
}
