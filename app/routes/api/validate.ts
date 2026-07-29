/**
 * @openapi
 * /validate:
 *   post:
 *     tags: [validate]
 *     summary: Validate metadata against a schema
 *     description: >
 *       Validates a metadata document against the specified schema and version using AJV.
 *       Returns enriched validation errors including suggestions for additionalProperties and enum violations.
 *     parameters:
 *       - name: input_schema
 *         in: query
 *         required: true
 *         description: Schema name to validate against (e.g. HDRUK).
 *         schema:
 *           type: string
 *           example: HDRUK
 *       - name: input_version
 *         in: query
 *         required: true
 *         description: Schema version to validate against (e.g. 3.0.0).
 *         schema:
 *           type: string
 *           example: "3.0.0"
 *       - name: subsection
 *         in: query
 *         description: Validate only a named subsection of the schema.
 *         schema:
 *           type: string
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
 *                 description: The metadata document to validate.
 *     responses:
 *       '200':
 *         description: Metadata is valid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 details:
 *                   type: string
 *                   example: all ok
 *       '400':
 *         description: Metadata failed validation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [error, details, data]
 *               properties:
 *                 error:
 *                   type: string
 *                   example: metadata validation failed
 *                 details:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ValidationError'
 *                 data:
 *                   type: object
 *                   description: The original metadata that was validated.
 */
import { ensureLoaded, validateMetadata, validateMetadataSection, getPropertyIndex, getNameDiscriminatorMap } from "~/lib/schema.server";
import { publishMessage } from "~/lib/audit.server";
import { fieldError, invalidParams, type FieldError } from "~/lib/errors.server";

function getValueAtPath(metadata: unknown, instancePath: string): unknown {
  if (!instancePath || instancePath === "/") return metadata;
  const parts = instancePath.replace(/^\//, "").split("/");
  let current: unknown = metadata;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      const idx = parseInt(decoded, 10);
      if (isNaN(idx)) return undefined;
      current = (current as unknown[])[idx];
    } else {
      current = (current as Record<string, unknown>)[decoded];
    }
  }
  return current;
}

export async function action({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const inputSchema = url.searchParams.get("input_schema");
  const inputVersion = url.searchParams.get("input_version");
  const subsection = url.searchParams.get("subsection") ?? undefined;

  let body: { metadata?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const { metadata } = body;

  // The old service validated params + metadata through a single
  // express-validator gate and returned every failure together under one
  // "Validation has failed" 400 with an `errors` array. Restore that shape.
  const paramErrors: FieldError[] = [];
  if (!inputSchema) paramErrors.push(fieldError("Invalid value", "input_schema", "query"));
  if (!inputVersion) paramErrors.push(fieldError("Invalid value", "input_version", "query"));
  // Match the old `body("metadata").isObject()` gate: reject missing / non-object
  // / array metadata, but let an empty object `{}` through to AJV validation
  // (old `.notEmpty()` stringified the object, so `{}` passed the gate).
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    paramErrors.push(fieldError("Invalid value", "metadata", "body", metadata));
  }
  if (paramErrors.length > 0) {
    publishMessage("POST", "validate", "Failed to validate metadata").catch(console.error);
    return invalidParams("Validation has failed", paramErrors);
  }

  const errors = subsection
    ? await validateMetadataSection(metadata, inputSchema!, inputVersion!, subsection)
    : await validateMetadata(metadata, inputSchema!, inputVersion!);

  if (errors.length > 0) {
    const propertyIndex = getPropertyIndex(inputSchema!, inputVersion!);
    const nameDiscriminatorMap = getNameDiscriminatorMap(inputSchema!, inputVersion!);

    // Deduplicate: AJV with allErrors:true emits the same error once per anyOf branch.
    // Keep only the first occurrence of each instancePath+message pair.
    const seen = new Set<string>();
    const deduped = (errors as Record<string, unknown>[]).filter((e) => {
      const key = `${e["instancePath"] ?? ""}::${e["message"] ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const enrichedErrors = deduped.map((e) => {
      if (e["keyword"] === "additionalProperties") {
        const addProp = (e["params"] as Record<string, unknown> | undefined)?.["additionalProperty"] as string | undefined;
        if (addProp) {
          const paths = propertyIndex.get(addProp);
          // Only suggest paths that have a parent (contain ".") — bare names come from walking
          // $defs in isolation and aren't useful as move-to targets.
          const rooted = paths?.filter(p => p.includes(".")) ?? [];
          const suggestion = rooted.length > 0 ? `Move to: ${rooted.join(" or ")}` : undefined;
          return suggestion ? { ...e, suggestion } : e;
        }
      }
      if (e["keyword"] === "enum") {
        const instancePath = (e["instancePath"] as string) ?? "";
        const invalidValue = getValueAtPath(metadata, instancePath);
        const ajvAllowedValues = (e["params"] as Record<string, unknown> | undefined)?.["allowedValues"] as unknown[] | undefined;

        // Walk up the instance path to find the nearest parent with a `name` field
        // that acts as a discriminator (e.g. { name: "Health and disease", subTypes: [...] })
        let discriminatorAllowedValues: unknown[] | undefined;
        const pathParts = instancePath.replace(/^\//, "").split("/").filter(Boolean);
        for (let len = pathParts.length - 1; len >= 1; len--) {
          const parentPath = "/" + pathParts.slice(0, len).join("/");
          const parentItem = getValueAtPath(metadata, parentPath);
          if (parentItem && typeof parentItem === "object" && !Array.isArray(parentItem)) {
            const parentName = (parentItem as Record<string, unknown>)["name"] as string | undefined;
            if (parentName && nameDiscriminatorMap.has(parentName)) {
              discriminatorAllowedValues = nameDiscriminatorMap.get(parentName);
              break;
            }
          }
        }

        // If the value is actually valid for the intended discriminated branch, suppress
        // (this error came from the wrong anyOf branch)
        if (discriminatorAllowedValues && discriminatorAllowedValues.includes(invalidValue)) {
          return null;
        }

        const effectiveAllowedValues = discriminatorAllowedValues ?? ajvAllowedValues;
        const MAX_SHOW = 6;
        const suggestion = effectiveAllowedValues?.length
          ? `Allowed: ${effectiveAllowedValues.slice(0, MAX_SHOW).map(v => JSON.stringify(v)).join(", ")}${effectiveAllowedValues.length > MAX_SHOW ? ` … (+${effectiveAllowedValues.length - MAX_SHOW} more)` : ""}`
          : undefined;

        return {
          ...e,
          ...(invalidValue !== undefined ? { invalidValue } : {}),
          ...(suggestion ? { suggestion } : {}),
          ...(effectiveAllowedValues?.length ? { allowedValues: effectiveAllowedValues } : {}),
        };
      }
      return e;
    }).filter(Boolean) as Record<string, unknown>[];
    publishMessage("POST", "validate", `Validation failed for ${inputSchema}:${inputVersion}`).catch(console.error);
    return Response.json({ error: "metadata validation failed", details: enrichedErrors, data: metadata }, { status: 400 });
  }

  publishMessage("POST", "validate", `Validated as ${inputSchema}:${inputVersion}`).catch(console.error);
  return Response.json({ details: "all ok" });
}
