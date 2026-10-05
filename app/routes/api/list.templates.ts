/**
 * @openapi
 * /list/templates:
 *   get:
 *     tags: [list]
 *     summary: List available translation templates
 *     description: Returns all loaded JSONata translation template descriptors.
 *     responses:
 *       '200':
 *         description: Array of template descriptors.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 */
import { getAvailableTemplates } from "~/lib/templates.server";
import { publishMessage } from "~/lib/audit.server";

export async function loader() {
  const templates = await getAvailableTemplates();
  publishMessage("GET", "list/templates", "Retrieved available templates").catch(console.error);
  return Response.json(templates);
}
