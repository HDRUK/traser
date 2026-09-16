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

  const paramErrors: FieldError[] = [];
  if (!inputSchema)
    paramErrors.push(fieldError("Invalid value", "input_schema", "query"));
  if (!inputVersion)
    paramErrors.push(fieldError("Invalid value", "input_version", "query"));
  if (!outputSchema)
    paramErrors.push(fieldError("Invalid value", "output_schema", "query"));
  if (!outputVersion)
    paramErrors.push(fieldError("Invalid value", "output_version", "query"));
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
  if (!template) {
    const notImplemented = `Translation for ${inputSchema}-${inputVersion} to ${outputSchema}-${outputVersion} is not implemented`;
    publishMessage(
      "GET",
      "get/map",
      `Failed to retrieve mapping for ${inputSchema}-${inputVersion} to ${outputSchema}-${outputVersion}`,
    ).catch(console.error);
    return Response.json(
      {
        error: "Translation not found",
        message: notImplemented,
        details: notImplemented,
      },
      { status: 400 },
    );
  }

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
    translation_map: template,
  });
}
