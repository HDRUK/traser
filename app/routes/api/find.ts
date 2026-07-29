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
import { fieldError, invalidRequest, type FieldError } from "~/lib/errors.server";

export async function action({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const withErrorsRaw = url.searchParams.get("with_errors");

  const errors: FieldError[] = [];

  // Content-Type must be application/json. The old service used
  // req.is('application/json'), which also rejects a *missing* header — the new
  // `?.includes(...) === false` check silently passed when the header was absent.
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    errors.push(fieldError("Invalid content type. Expected JSON.", "", "body"));
  }

  // with_errors is optional and defaults to 0, but when present must be 0 or 1
  // (old: isInt({ min: 0, max: 1 })).
  let withErrors = false;
  if (withErrorsRaw !== null && withErrorsRaw !== "") {
    if (withErrorsRaw === "0" || withErrorsRaw === "1") {
      withErrors = withErrorsRaw === "1";
    } else {
      errors.push(fieldError("Invalid value", "with_errors", "query", withErrorsRaw));
    }
  }

  if (errors.length > 0) {
    publishMessage(
      "POST",
      "find",
      "Failed to validate posted metadata against available schemas"
    ).catch(console.error);
    return invalidRequest(errors);
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
