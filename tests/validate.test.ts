import { describe, it, expect } from "vitest";
import { BASE_URL, sampleMetadata, validate } from "./helpers";

describe("POST /validate", () => {
  // ── Happy paths ──────────────────────────────────────────────────────────

  it("GWDM 1.0 metadata validates", async () => {
    const res = await validate({
      metadata: sampleMetadata.gdmv1,
      modelName: "GWDM",
      modelVersion: "1.0",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ details: "all ok" });
  });

  it("HDRUK 2.1.2 metadata validates", async () => {
    const res = await validate({
      metadata: sampleMetadata.hdrukv211,
      modelName: "HDRUK",
      modelVersion: "2.1.2",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ details: "all ok" });
  });

  it("GWDM 2.0 metadata validates", async () => {
    const res = await validate({
      metadata: sampleMetadata.gwdm20,
      modelName: "GWDM",
      modelVersion: "2.0",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ details: "all ok" });
  });

  it("HDRUK 3.0.0 metadata validates", async () => {
    const res = await validate({
      metadata: sampleMetadata.hdruk300,
      modelName: "HDRUK",
      modelVersion: "3.0.0",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ details: "all ok" });
  });

  it("HDRUK 4.0.0 metadata validates", async () => {
    const res = await validate({
      metadata: sampleMetadata.hdruk400,
      modelName: "HDRUK",
      modelVersion: "4.0.0",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ details: "all ok" });
  });

  it("validates a subsection", async () => {
    const partial = { summary: (sampleMetadata.gdmv1 as { summary: unknown }).summary };
    const res = await validate({
      metadata: partial,
      modelName: "GWDM",
      modelVersion: "1.0",
      subsection: "summary",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ details: "all ok" });
  });

  // ── Error paths ──────────────────────────────────────────────────────────

  it("returns 400 when input_schema and input_version are missing", async () => {
    const res = await fetch(`${BASE_URL}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: sampleMetadata.hdrukv211 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/input_schema.*input_version/i);
  });

  it("returns 400 with details array when metadata fails HDRUK 2.1.2 validation", async () => {
    const res = await validate({
      metadata: { notARealField: true },
      modelName: "HDRUK",
      modelVersion: "2.1.2",
    });
    expect(res.status).toBe(400);
    const body = res.body as { error: string; details: unknown[]; data: unknown };
    expect(body.error).toBe("metadata validation failed");
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  it("returns 400 with details array when metadata fails GWDM 1.0 validation", async () => {
    const res = await validate({
      metadata: {},
      modelName: "GWDM",
      modelVersion: "1.0",
    });
    expect(res.status).toBe(400);
    const body = res.body as { error: string; details: unknown[] };
    expect(body.error).toBe("metadata validation failed");
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });
});
