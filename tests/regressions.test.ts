import { describe, it, expect } from "vitest";
import { BASE_URL, sampleMetadata } from "./helpers";

const M = sampleMetadata as Record<string, Record<string, unknown>>;

/**
 * Regression tests pinning the response contracts the Express→React Router
 * rewrite had silently changed. Each asserts the shape the old service returned
 * so a future edit can't drop it again.
 */

describe("400 error-shape parity (missing/invalid params)", () => {
  it("/get/schema missing name → { message, errors:[...] }", async () => {
    const res = await fetch(`${BASE_URL}/get/schema`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("Invalid query parameters.");
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0]).toHaveProperty("msg");
    expect(body.errors[0]).toHaveProperty("path", "name");
  });

  it("/get/map missing params → { message, errors:[...] }", async () => {
    const res = await fetch(`${BASE_URL}/get/map?input_schema=HDRUK`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("Invalid query parameters.");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("/get/map unknown translation → keeps the `message` key", async () => {
    const res = await fetch(
      `${BASE_URL}/get/map?input_schema=HDRUK&input_version=9.9.9&output_schema=GWDM&output_version=9.9.9`
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Translation not found");
    expect(typeof body.message).toBe("string"); // regression: this key had been dropped
  });

  it("/validate missing params → { message:'Validation has failed', errors:[...] }", async () => {
    const res = await fetch(`${BASE_URL}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: {} }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("Validation has failed");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("/list/translations missing params → { message:'Translation has failed.', errors:[...] }", async () => {
    const res = await fetch(`${BASE_URL}/list/translations?schema=HDRUK`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("Translation has failed.");
    expect(Array.isArray(body.errors)).toBe(true);
  });
});

describe("/find request validation", () => {
  it("rejects a missing Content-Type header", async () => {
    // No Content-Type header at all — old service 400'd, the rewrite let it pass.
    const res = await fetch(`${BASE_URL}/find`, {
      method: "POST",
      body: JSON.stringify(M.hdrukv211 ?? {}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0].msg).toBe("Invalid content type. Expected JSON.");
  });

  it("rejects an out-of-range with_errors value", async () => {
    const res = await fetch(`${BASE_URL}/find?with_errors=2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(M.hdrukv211 ?? {}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0].path).toBe("with_errors");
  });
});

describe("security headers", () => {
  it("sets helmet-equivalent headers on API responses", async () => {
    const res = await fetch(`${BASE_URL}/list/schemas`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});
