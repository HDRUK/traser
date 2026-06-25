/**
 * @openapi
 * /get/schema:
 *   get:
 *     tags: [get]
 *     summary: Fetch a schema definition
 *     description: Returns the compiled JSON Schema for the specified schema name and version.
 *     parameters:
 *       - name: name
 *         in: query
 *         required: true
 *         description: Schema name (e.g. HDRUK).
 *         schema:
 *           type: string
 *           example: HDRUK
 *       - name: version
 *         in: query
 *         description: Schema version. Uses the latest available version if omitted.
 *         schema:
 *           type: string
 *           example: "3.0.0"
 *     responses:
 *       '200':
 *         description: Schema definition.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 version:
 *                   type: string
 *                 schema:
 *                   type: object
 *                   description: The JSON Schema definition.
 *       '400':
 *         description: Schema not found or missing parameters.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
import { ensureLoaded, getSchema } from "~/lib/schema.server";
import { publishMessage } from "~/lib/audit.server";

export async function loader({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const version = url.searchParams.get("version") ?? "";

  if (!name) {
    return Response.json({ message: "name query param is required" }, { status: 400 });
  }

  const validator = getSchema(name, version);
  if (!validator?.schema) {
    return Response.json({ error: `Schema ${name}:${version} not found` }, { status: 400 });
  }

  publishMessage("GET", "get/schema", `${name}-${version} retrieved`).catch(console.error);
  return Response.json({ name, version, schema: validator.schema });
}
