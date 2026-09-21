import { describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers";

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
