import { describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers";

/**
 * PR04 shipped `/openapi.json` reading a build-time spec because globbing
 * `app/routes/api/*.ts` at runtime returns nothing in the production image —
 * the sources are not shipped. A spec with zero paths is the shape that defect
 * produced, so pin the documented surface rather than just "is valid JSON".
 */

const DOCUMENTED = [
  "/find",
  "/get/form_hydration",
  "/get/map",
  "/get/schema",
  "/list/schemas",
  "/list/templates",
  "/list/translations",
  "/status",
  "/translate",
  "/validate",
];

describe("GET /openapi.json", () => {
  it("documents every public API path", async () => {
    const res = await fetch(`${BASE_URL}/openapi.json`);
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(Object.keys(spec.paths ?? {}).sort()).toEqual(DOCUMENTED);
  });
});
