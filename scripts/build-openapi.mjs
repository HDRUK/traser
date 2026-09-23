#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import swaggerJsdoc from "swagger-jsdoc";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(root, "build", "openapi.json");

const definition = JSON.parse(
  await readFile(resolve(root, "app", "lib", "openapi-definition.json"), "utf8")
);

const spec = swaggerJsdoc({
  definition,
  apis: [resolve(root, "app", "routes", "api", "*.ts")],
});

const pathCount = Object.keys(spec.paths ?? {}).length;
if (pathCount === 0) {
  process.stderr.write(
    "build-openapi: swagger-jsdoc produced a spec with no paths. " +
      "Refusing to write an empty spec — check the JSDoc blocks in app/routes/api/.\n"
  );
  process.exit(1);
}

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
process.stdout.write(`build-openapi: wrote build/openapi.json (${pathCount} paths)\n`);
