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
import { publishMessage } from "~/lib/audit.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const inputSchema = url.searchParams.get("input_schema");
  const inputVersion = url.searchParams.get("input_version");
  const outputSchema = url.searchParams.get("output_schema");
  const outputVersion = url.searchParams.get("output_version");

  if (!inputSchema || !inputVersion || !outputSchema || !outputVersion) {
    return Response.json(
      { message: "input_schema, input_version, output_schema, output_version are all required" },
      { status: 400 }
    );
  }

  const template = await getTemplate(inputSchema, inputVersion, outputSchema, outputVersion);
  if (!template) {
    return Response.json(
      {
        error: "Translation not found",
        details: `No map for ${inputSchema}-${inputVersion} → ${outputSchema}-${outputVersion}`,
      },
      { status: 400 }
    );
  }

  publishMessage("GET", "get/map", `Map ${inputSchema}-${inputVersion} → ${outputSchema}-${outputVersion} retrieved`).catch(console.error);
  return Response.json({
    input_schema: inputSchema,
    input_version: inputVersion,
    output_schema: outputSchema,
    output_version: outputVersion,
    translation_map: template,
  });
}
