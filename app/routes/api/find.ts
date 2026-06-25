/**
 * @openapi
 * /find:
 *   post:
 *     tags: [find]
 *     summary: Find schemas that match a metadata document
 *     description: Tests the provided metadata against all loaded schemas and returns the ones that validate successfully.
 *     parameters:
 *       - name: with_errors
 *         in: query
 *         description: Set to 1 to include validation error details for non-matching schemas.
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *           default: "0"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: The metadata document to test.
 *     responses:
 *       '200':
 *         description: List of schemas that matched, optionally with validation error details for misses.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *       '400':
 *         description: Invalid request (missing or non-JSON body).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
import { ensureLoaded, findMatchingSchemas } from "~/lib/schema.server";
import { publishMessage } from "~/lib/audit.server";

export async function action({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const withErrors = url.searchParams.get("with_errors") === "1";

  if (request.headers.get("content-type")?.includes("application/json") === false) {
    return Response.json({ errors: ["Invalid content type. Expected JSON."] }, { status: 400 });
  }

  let metadata: unknown;
  try {
    metadata = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const result = await findMatchingSchemas(metadata, withErrors);
  publishMessage("POST", "find", "Validated metadata against available schemas").catch(console.error);
  return Response.json(result);
}
