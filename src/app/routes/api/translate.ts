import { ensureLoaded, validateMetadata, validateMetadataSection } from "~/lib/schema.server";
import { findModelAndVersion, getDefaultModelAndVersion, translate } from "~/lib/translation.server";
import { TranslationGraph } from "~/lib/graph.server";
import { publishMessage } from "~/lib/audit.server";

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
        return Response.json(detected.error, { status: detected.error.status ?? 400 });
      }
      inputSchema = detected.name!;
      inputVersion = detected.version!;
    }

    // ── Default output schema ──────────────────────────────────────────────
    if (!outputSchema || !outputVersion) {
      const defaulted = await getDefaultModelAndVersion(outputSchema, outputVersion);
      if (defaulted.error) {
        return Response.json(defaulted.error, { status: defaulted.error.status ?? 400 });
      }
      outputSchema = defaulted.name!;
      outputVersion = defaulted.version!;
    }

    // ── Build translation graph ────────────────────────────────────────────
    const graph = await TranslationGraph.create();

    if (!graph.nodes[`${inputSchema}:${inputVersion}`]) {
      return Response.json(
        { message: `Cannot support the input model (${inputSchema}:${inputVersion})` },
        { status: 400 }
      );
    }
    if (!graph.nodes[`${outputSchema}:${outputVersion}`]) {
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
      return Response.json(
        { message: `Failed to find translation between ${startNode} and ${endNode}` },
        { status: 500 }
      );
    }

    // ── Apply chained translations ─────────────────────────────────────────
    let current: unknown = metadata;
    for (let i = 1; i < translationsToApply!.length; i++) {
      const inM = translationsToApply![i - 1];
      const outM = translationsToApply![i];
      const result = await translate(current, extra, inM.name, inM.version, outM.name, outM.version);
      if (result.error) {
        return Response.json(result.error, { status: result.error.status ?? 500 });
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
        return Response.json(
          { message: "Output metadata validation failed", details: errors, data: outputMetadata },
          { status: 400 }
        );
      }
    }

    publishMessage("POST", "translate", `Translated ${inputSchema}:${inputVersion} → ${outputSchema}:${outputVersion}`).catch(console.error);
    return Response.json(outputMetadata);
  } catch (err) {
    const e = err as { status?: number; message?: string; details?: unknown };
    publishMessage("POST", "translate", `Translation failed`).catch(console.error);
    return Response.json({ message: e.message, details: e.details ?? {} }, { status: e.status ?? 500 });
  }
}
