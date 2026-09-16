import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import definition from "~/lib/openapi-definition.json";

const GENERATED_SPEC = resolve(process.cwd(), "build/openapi.json");
const SOURCE_GLOB = resolve(process.cwd(), "app/routes/api/*.ts");

// The spec is compiled at build time by scripts/build-openapi.mjs, because the
// production image contains build/ but not app/ — globbing sources at runtime
// there matches nothing and yields a spec with no paths.
async function loadSpec(): Promise<unknown> {
  try {
    return JSON.parse(await readFile(GENERATED_SPEC, "utf8"));
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `build/openapi.json is missing — run "npm run build" to generate it (${String(err)})`
      );
    }
    const { default: swaggerJsdoc } = await import("swagger-jsdoc");
    return swaggerJsdoc({ definition, apis: [SOURCE_GLOB] });
  }
}

let cachedSpec: unknown;

export async function loader() {
  cachedSpec ??= await loadSpec();
  return Response.json(cachedSpec);
}
