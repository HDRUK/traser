/**
 * @openapi
 * /list/schemas:
 *   get:
 *     tags: [list]
 *     summary: List available schemas
 *     description: Returns all schema names and their available versions.
 *     responses:
 *       '200':
 *         description: Map of schema name to array of versions.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: array
 *                 items:
 *                   type: string
 *               example:
 *                 HDRUK: ["2.1.2", "2.1.3", "3.0.0"]
 *                 GWDM: ["1.0", "2.0"]
 *                 SchemaOrg: ["1.0"]
 */
import { ensureLoaded, getAvailableSchemas } from "~/lib/schema.server";
import { publishMessage } from "~/lib/audit.server";

export async function loader() {
  await ensureLoaded();
  const schemas = await getAvailableSchemas();
  publishMessage("GET", "list/schemas", "Retrieved available schemas").catch(console.error);
  return Response.json(schemas);
}
