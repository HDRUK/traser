import type { Column } from "./types";

function latestGwdmVersion(schemas: Record<string, string[]>): string | undefined {
  return schemas["GWDM"]?.at(-1);
}

function makeColumnPusher(cols: Column[], added: Set<string>, showInputMarker: boolean, referenceKey: string) {
  return (schema: string, version: string) => {
    const key = `${schema}:${version}`;
    if (added.has(key)) return;
    cols.push({ schema, version, key, isReference: showInputMarker && key === referenceKey });
    added.add(key);
  };
}

function pushReferenceAndGwdmColumns(schemas: Record<string, string[]>, referenceVersion: string | undefined, push: (schema: string, version: string) => void) {
  if (referenceVersion && schemas["GWDM"]?.includes(referenceVersion)) push("GWDM", referenceVersion);
  for (const v of [...(schemas["GWDM"] ?? [])].reverse()) push("GWDM", v);
}

function pushHdrukAndSchemaOrgColumns(schemas: Record<string, string[]>, push: (schema: string, version: string) => void) {
  for (const v of [...(schemas["HDRUK"] ?? [])].reverse()) push("HDRUK", v);
  for (const v of schemas["SchemaOrg"] ?? []) push("SchemaOrg", v);
}

function pushRemainingColumns(schemas: Record<string, string[]>, push: (schema: string, version: string) => void) {
  for (const [schema, versions] of Object.entries(schemas)) {
    for (const version of versions) push(schema, version);
  }
}

export function buildColumns(schemas: Record<string, string[]>, showInputMarker: boolean): Column[] {
  const cols: Column[] = [];
  const added = new Set<string>();
  const referenceVersion = latestGwdmVersion(schemas);
  const push = makeColumnPusher(cols, added, showInputMarker, `GWDM:${referenceVersion ?? ""}`);

  pushReferenceAndGwdmColumns(schemas, referenceVersion, push);
  pushHdrukAndSchemaOrgColumns(schemas, push);
  pushRemainingColumns(schemas, push);

  return cols;
}
