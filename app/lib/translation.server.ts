import jsonata from "jsonata";
import { getAvailableSchemas, findMatchingSchemas, validateMetadata } from "./schema.server";
import { getTemplate } from "./templates.server";
import { TranslationGraph } from "./graph.server";

export async function findModelAndVersion(
  metadata: unknown,
  selectFirstMatching = true
): Promise<{ name?: string; version?: string; error?: { status: number; message: string; details?: unknown } }> {
  const availableSchemas = await getAvailableSchemas();
  const matchingSchemas = await findMatchingSchemas(metadata, false);
  const matches = matchingSchemas.filter((s) => s.matches);

  if (matches.length < 1) {
    return {
      error: {
        status: 400,
        message: "Input metadata object matched no known schemas",
        details: { available_schemas: availableSchemas },
      },
    };
  }

  if (matches.length > 1 && !selectFirstMatching) {
    return {
      error: {
        status: 400,
        message: "Input metadata object matched multiple schemas! Something could be wrong..",
        details: matchingSchemas,
      },
    };
  }

  return { name: matches[0].name, version: matches[0].version };
}

export async function getDefaultModelAndVersion(
  name?: string,
  version?: string
): Promise<{ name?: string; version?: string; error?: { status: number; message: string; details?: unknown } }> {
  const availableSchemas = await getAvailableSchemas();

  if (name && !version) {
    return {
      error: {
        status: 400,
        message: "Translation not possible",
        details: `Attempting to translate to ${name} but no version provided!`,
      },
    };
  }

  const gwdmVersions = availableSchemas["GWDM"];
  if (gwdmVersions) {
    return { name: "GWDM", version: gwdmVersions[gwdmVersions.length - 1] };
  }

  return {
    error: {
      status: 500,
      message: "Translation not possible",
      details: "Unknown model and version to translate to",
    },
  };
}

export async function translate(
  metadata: unknown,
  extra: unknown,
  inputModelName: string,
  inputModelVersion: string,
  outputModelName: string,
  outputModelVersion: string
): Promise<{
  translatedMetadata?: unknown;
  outputMetadata?: unknown;
  error?: { status: number; message: string; details?: unknown };
}> {
  // Identity — no translation needed
  if (inputModelName === outputModelName && inputModelVersion === outputModelVersion) {
    return { outputMetadata: metadata };
  }

  let template: string | null;
  try {
    template = await getTemplate(
      inputModelName,
      inputModelVersion,
      outputModelName,
      outputModelVersion
    );
  } catch (err) {
    return {
      error: {
        status: 500,
        message: `Translation for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion} has failed`,
        details: String(err),
      },
    };
  }

  if (!template) {
    return {
      error: {
        status: 400,
        message: "Translation not found",
        details: `Failed to load translation map for ${inputModelName} to ${outputModelName}`,
      },
    };
  }

  // The source object shape expected by JSONata templates: { input, extra }
  const source = { input: metadata, extra };

  let expression: ReturnType<typeof jsonata>;
  try {
    expression = jsonata(template);
  } catch (err) {
    return {
      error: {
        status: 400,
        details: err,
        message: `JSONata failure for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion}`,
      },
    };
  }

  let translatedMetadata: unknown;
  try {
    translatedMetadata = await expression.evaluate(source);
  } catch (err) {
    return {
      error: {
        status: 400,
        details: err,
        message: `Translation evaluation failure for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion}`,
      },
    };
  }

  return { translatedMetadata };
}

/**
 * Full pipeline: multi-hop translation from GWDM:2.0 → targetSchema:targetVersion
 * followed by validation. Used by refresh.server.ts for batch testing.
 */
export async function translateAndValidate(
  metadata: unknown,
  targetSchema: string,
  targetVersion: string
): Promise<{
  translated: boolean;
  valid: boolean;
  reason?: string;
  translateBody?: unknown;
  validateBody?: unknown;
}> {
  const inputSchema = "GWDM";
  const inputVersion = "2.0";

  const graph = await TranslationGraph.create();

  const startNode = `${inputSchema}:${inputVersion}`;
  const endNode = `${targetSchema}:${targetVersion}`;

  if (!graph.nodes[startNode] || !graph.nodes[endNode]) {
    return { translated: false, valid: false, reason: `No path from ${startNode} to ${endNode}` };
  }

  const predecessors = graph.dijkstra(startNode);
  const { translationsToApply, error: pathError } = graph.getPath(startNode, endNode, predecessors);
  if (pathError || !translationsToApply) {
    return { translated: false, valid: false, reason: pathError?.message };
  }

  // Apply chained translations
  let current: unknown = metadata;
  for (let i = 1; i < translationsToApply.length; i++) {
    const inM = translationsToApply[i - 1];
    const outM = translationsToApply[i];
    const result = await translate(current, undefined, inM.name, inM.version, outM.name, outM.version);
    if (result.error) {
      return {
        translated: false,
        valid: false,
        reason: result.error.message?.slice(0, 200),
        translateBody: result.error,
      };
    }
    current = result.translatedMetadata ?? result.outputMetadata;
  }

  // Validate
  const errors = await validateMetadata(current, targetSchema, targetVersion);
  if (errors.length > 0) {
    const reason = (errors as Array<{ instancePath?: string; message?: string }>)
      .slice(0, 3)
      .map((e) => `${e.instancePath ?? "(root)"}: ${e.message ?? "error"}`)
      .join(" | ")
      .slice(0, 300);
    return { translated: true, valid: false, reason, validateBody: { details: errors } };
  }

  return { translated: true, valid: true };
}
