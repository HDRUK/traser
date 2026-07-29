/**
 * @openapi
 * /translate:
 *   post:
 *     tags: [translate]
 *     summary: Translate metadata to another schema
 *     description: >
 *       Translates a metadata document from one schema/version to another.
 *       If input_schema/input_version are omitted, the input schema is auto-detected.
 *       If output_schema/output_version are omitted, the configured default output schema is used.
 *       Multi-hop translations (e.g. HDRUK → GWDM → SchemaOrg) are resolved automatically via Dijkstra's algorithm.
 *     parameters:
 *       - name: input_schema
 *         in: query
 *         description: Source schema name (e.g. HDRUK). Auto-detected from the metadata if omitted.
 *         schema:
 *           type: string
 *           example: HDRUK
 *       - name: input_version
 *         in: query
 *         description: Source schema version (e.g. 2.1.2). Auto-detected if omitted.
 *         schema:
 *           type: string
 *           example: "2.1.2"
 *       - name: output_schema
 *         in: query
 *         description: Target schema name. Defaults to the server-configured default if omitted.
 *         schema:
 *           type: string
 *           example: GWDM
 *       - name: output_version
 *         in: query
 *         description: Target schema version. Defaults to the server-configured default if omitted.
 *         schema:
 *           type: string
 *           example: "2.0"
 *       - name: validate_input
 *         in: query
 *         description: Set to 0 to skip input validation. Enabled by default.
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *           default: "1"
 *       - name: validate_output
 *         in: query
 *         description: Set to 0 to skip output validation. Enabled by default.
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *           default: "1"
 *       - name: subsection
 *         in: query
 *         description: Validate/translate only a named subsection of the schema.
 *         schema:
 *           type: string
 *       - name: select_first_matching
 *         in: query
 *         description: Set to false to error when multiple schemas match during auto-detection instead of picking the first.
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "true"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [metadata]
 *             properties:
 *               metadata:
 *                 type: object
 *                 description: The metadata document to translate.
 *               extra:
 *                 type: object
 *                 description: Optional supplementary data passed to JSONata templates as extra.*.
 *     responses:
 *       '200':
 *         description: Translated metadata document.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       '400':
 *         description: Validation failed or parameters missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 details:
 *                   oneOf:
 *                     - type: object
 *                       properties:
 *                         validationErrors:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/ValidationError'
 *                         data:
 *                           type: object
 *                     - type: array
 *                       items:
 *                         $ref: '#/components/schemas/ValidationError'
 *                 data:
 *                   type: object
 */
import { ensureLoaded, validateMetadata, validateMetadataSection } from "~/lib/schema.server";
import { findModelAndVersion, getDefaultModelAndVersion, translate } from "~/lib/translation.server";
import { TranslationGraph } from "~/lib/graph.server";
import { publishMessage } from "~/lib/audit.server";
import { forwardKnownError, errorResponse } from "~/lib/errors.server";

export async function action({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  let inputSchema = url.searchParams.get("input_schema") ?? undefined;
  let inputVersion = url.searchParams.get("input_version") ?? undefined;
  let outputSchema = url.searchParams.get("output_schema") ?? undefined;
  let outputVersion = url.searchParams.get("output_version") ?? undefined;
  const validateInput = url.searchParams.get("validate_input") !== "0";
  const validateOutput = url.searchParams.get("validate_output") !== "0";
  const subsection = url.searchParams.get("subsection") ?? undefined;
  const selectFirstMatching = url.searchParams.get("select_first_matching") !== "false";

  let body: { metadata?: unknown; extra?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { metadata, extra } = body;
  if (!metadata || typeof metadata !== "object") {
    return Response.json({ message: "metadata must be a non-empty object" }, { status: 400 });
  }

  try {
    // ── Auto-detect input schema ───────────────────────────────────────────
    if (!inputSchema || !inputVersion) {
      const detected = await findModelAndVersion(metadata, selectFirstMatching);
      if (detected.error) {
        publishMessage("POST", "translate", "Failed to detect input schema for posted metadata").catch(console.error);
        return forwardKnownError(detected.error);
      }
      inputSchema = detected.name!;
      inputVersion = detected.version!;
    }

    // ── Default output schema ──────────────────────────────────────────────
    if (!outputSchema || !outputVersion) {
      const defaulted = await getDefaultModelAndVersion(outputSchema, outputVersion);
      if (defaulted.error) {
        publishMessage("POST", "translate", "Failed to determine output schema").catch(console.error);
        return forwardKnownError(defaulted.error);
      }
      outputSchema = defaulted.name!;
      outputVersion = defaulted.version!;
    }

    // ── Build translation graph ────────────────────────────────────────────
    const graph = await TranslationGraph.create();

    if (!graph.nodes[`${inputSchema}:${inputVersion}`]) {
      publishMessage("POST", "translate", `Unsupported input model ${inputSchema}:${inputVersion}`).catch(console.error);
      return Response.json(
        { message: `Cannot support the input model (${inputSchema}:${inputVersion})` },
        { status: 400 }
      );
    }
    if (!graph.nodes[`${outputSchema}:${outputVersion}`]) {
      publishMessage("POST", "translate", `Unsupported output model ${outputSchema}:${outputVersion}`).catch(console.error);
      return Response.json(
        { message: `Cannot support the output model (${outputSchema}:${outputVersion})` },
        { status: 400 }
      );
    }

    // ── Validate input ─────────────────────────────────────────────────────
    if (validateInput) {
      const errors = subsection
        ? await validateMetadataSection(metadata, inputSchema, inputVersion, subsection)
        : await validateMetadata(metadata, inputSchema, inputVersion);
      if (errors.length > 0) {
        publishMessage("POST", "translate", `Input metadata failed validation as ${inputSchema}:${inputVersion}`).catch(console.error);
        return Response.json(
          { message: "Input metadata validation failed", details: { validationErrors: errors, data: metadata } },
          { status: 400 }
        );
      }
    }

    // ── Find translation path via Dijkstra ────────────────────────────────
    const startNode = `${inputSchema}:${inputVersion}`;
    const endNode = `${outputSchema}:${outputVersion}`;
    const predecessors = graph.dijkstra(startNode);
    const { translationsToApply, error: pathError } = graph.getPath(startNode, endNode, predecessors);
    if (pathError) {
      // Forward the graph's own 400 + message rather than masking a
      // missing-route (a client-input problem) as a 500 server fault.
      publishMessage("POST", "translate", `No translation path between ${startNode} and ${endNode}`).catch(console.error);
      return forwardKnownError(pathError);
    }

    // ── Apply chained translations ─────────────────────────────────────────
    let current: unknown = metadata;
    for (let i = 1; i < translationsToApply!.length; i++) {
      const inM = translationsToApply![i - 1];
      const outM = translationsToApply![i];
      const result = await translate(current, extra, inM.name, inM.version, outM.name, outM.version);
      if (result.error) {
        publishMessage("POST", "translate", `Translation step ${inM.name}:${inM.version} → ${outM.name}:${outM.version} failed`).catch(console.error);
        return forwardKnownError(result.error);
      }
      current = result.translatedMetadata ?? result.outputMetadata;
    }

    const outputMetadata = current;

    // ── Validate output ────────────────────────────────────────────────────
    if (validateOutput) {
      const errors = subsection
        ? await validateMetadataSection(outputMetadata, outputSchema, outputVersion, subsection)
        : await validateMetadata(outputMetadata, outputSchema, outputVersion);
      if (errors.length > 0) {
        publishMessage("POST", "translate", `Output metadata failed validation as ${outputSchema}:${outputVersion}`).catch(console.error);
        return Response.json(
          { message: "Output metadata validation failed", details: errors, data: outputMetadata },
          { status: 400 }
        );
      }
    }

    publishMessage("POST", "translate", `Translated ${inputSchema}:${inputVersion} → ${outputSchema}:${outputVersion}`).catch(console.error);
    return Response.json(outputMetadata);
  } catch (err) {
    // Unexpected/thrown error — genericise any 5xx so internal detail can't leak
    // (the old central error handler's err.expose gate).
    publishMessage("POST", "translate", "Translation failed").catch(console.error);
    return errorResponse(err, 500);
  }
}
