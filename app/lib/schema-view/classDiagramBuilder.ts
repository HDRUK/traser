export type JsonSchema = Record<string, unknown>;

function getDefs(schema: JsonSchema): Record<string, JsonSchema> {
  return (schema["$defs"] ?? schema["definitions"] ?? {}) as Record<
    string,
    JsonSchema
  >;
}

function extractRef(propSchema: JsonSchema): string | null {
  if (typeof propSchema["$ref"] === "string") return propSchema["$ref"];

  if (Array.isArray(propSchema["allOf"])) {
    const hit = (propSchema["allOf"] as JsonSchema[]).find(
      (s) => typeof s["$ref"] === "string",
    );
    if (hit) return hit["$ref"] as string;
  }

  if (Array.isArray(propSchema["anyOf"])) {
    const hit = (propSchema["anyOf"] as JsonSchema[]).find(
      (s) => typeof s["$ref"] === "string" && s["type"] !== "null",
    );
    if (hit) return hit["$ref"] as string;
  }

  return null;
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema | null {
  const parts = ref.replace(/^#\//, "").split("/");
  let node: unknown = root;
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return null;
    node = (node as Record<string, unknown>)[part];
  }
  return (node as JsonSchema) ?? null;
}

function isObjectDef(schema: JsonSchema): boolean {
  return schema["type"] === "object" && "properties" in schema;
}

function defNameFromRef(ref: string): string {
  return ref.split("/").pop() ?? ref;
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

function typeLabel(root: JsonSchema, propSchema: JsonSchema, depth = 0): string {
  if (depth > 3) return "Any";

  const ref = extractRef(propSchema);
  if (ref) {
    const resolved = resolveRef(root, ref);
    if (resolved) {
      if (isObjectDef(resolved)) return defNameFromRef(ref);
      return typeLabel(root, resolved, depth + 1);
    }
    return defNameFromRef(ref);
  }

  const type = propSchema["type"];
  if (type === "string") {
    if (Array.isArray(propSchema["enum"])) return "Enum";
    return "String";
  }
  if (type === "integer" || type === "number") return "Number";
  if (type === "boolean") return "Boolean";
  if (type === "null") return "Null";
  if (type === "array") {
    const items = propSchema["items"] as JsonSchema | undefined;
    if (items) {
      const itemRef = extractRef(items);
      if (itemRef) {
        const resolved = resolveRef(root, itemRef);
        if (resolved && isObjectDef(resolved))
          return `${defNameFromRef(itemRef)}[]`;
      }
    }
    return "Array";
  }

  if (Array.isArray(propSchema["anyOf"])) {
    const anyOf = propSchema["anyOf"] as JsonSchema[];
    for (const s of anyOf) {
      if (s["type"] === "null") continue;
      const label = typeLabel(root, s, depth + 1);
      if (label !== "Any") return label;
    }
    return "Any";
  }

  if (Array.isArray(propSchema["allOf"])) {
    const allOf = propSchema["allOf"] as JsonSchema[];
    for (const s of allOf) {
      const label = typeLabel(root, s, depth + 1);
      if (label !== "Any") return label;
    }
  }

  return "Any";
}

interface ClassNode {
  id: string;
  label: string;
  members: string[];
}

export function buildClassDiagram(schema: JsonSchema): string {
  const defs = getDefs(schema);
  const classes = new Map<string, ClassNode>();
  const edges: string[] = [];
  const visited = new Set<string>();

  function visit(name: string, node: JsonSchema, depth: number) {
    if (visited.has(name) || depth > 4 || classes.size >= 25) return;
    visited.add(name);

    const properties = (node["properties"] ?? {}) as Record<string, JsonSchema>;
    const required = (node["required"] ?? []) as string[];
    const members: string[] = [];
    const childRefs: Array<{ propName: string; refName: string }> = [];

    for (const [propName, propSchema] of Object.entries(properties)) {
      const isReq = required.includes(propName);
      const marker = isReq ? "+" : " ";

      const ref = extractRef(propSchema as JsonSchema);
      if (ref) {
        const resolved = resolveRef(schema, ref);
        const refName = defNameFromRef(ref);
        if (resolved && isObjectDef(resolved)) {
          members.push(`${marker}${refName} ${propName}`);
          childRefs.push({ propName, refName });
          continue;
        }
      }

      if ((propSchema as JsonSchema)["type"] === "array") {
        const items = (propSchema as JsonSchema)["items"] as
          | JsonSchema
          | undefined;
        if (items) {
          const itemRef = extractRef(items);
          if (itemRef) {
            const resolved = resolveRef(schema, itemRef);
            const refName = defNameFromRef(itemRef);
            if (resolved && isObjectDef(resolved)) {
              members.push(`${marker}${refName}[] ${propName}`);
              childRefs.push({ propName, refName });
              continue;
            }
          }
        }
      }

      const label = typeLabel(schema, propSchema as JsonSchema);
      members.push(`${marker}${label} ${propName}`);
    }

    const id = sanitizeId(name);
    classes.set(name, { id, label: name, members });

    for (const { refName } of childRefs) {
      const defNode = defs[refName];
      if (defNode && isObjectDef(defNode)) {
        edges.push(`  ${id} --> ${sanitizeId(refName)}`);
        visit(refName, defNode, depth + 1);
      }
    }
  }

  const rootName = (schema["title"] as string | undefined) ?? "Root";
  visit(rootName, schema, 0);

  if (classes.size === 0) return "";

  const lines: string[] = ["classDiagram"];

  for (const { id, label, members } of classes.values()) {
    const escapedLabel = label !== id ? `["${label}"]` : "";
    lines.push(`  class ${id}${escapedLabel} {`);
    for (const m of members) {
      lines.push(`    ${m}`);
    }
    lines.push("  }");
  }

  for (const edge of edges) {
    lines.push(edge);
  }

  return lines.join("\n");
}
