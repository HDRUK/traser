import { describe, it, expect } from "vitest";
import { sampleMetadata, translate } from "./helpers";

const M = sampleMetadata as Record<string, Record<string, unknown>>;

describe("POST /translate", () => {
  // ── Happy paths with body assertions ────────────────────────────────────

  it("GWDM 1.0 → SchemaOrg GoogleRecommended produces a Dataset", async () => {
    const res = await translate({
      metadata: M.gdmv1,
      inputModel: "GWDM", inputModelVersion: "1.0",
      outputModel: "SchemaOrg", outputModelVersion: "GoogleRecommended",
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body["@type"]).toBe("Dataset");
    expect(typeof body["name"]).toBe("string");
  });

  it("GWDM 1.0 → SchemaOrg BioSchema", async () => {
    const res = await translate({
      metadata: M.gdmv1,
      inputModel: "GWDM", inputModelVersion: "1.0",
      outputModel: "SchemaOrg", outputModelVersion: "BioSchema",
    });
    expect(res.status).toBe(200);
  });

  it("SchemaOrg default → GWDM 1.0", async () => {
    const res = await translate({
      metadata: M.schemaorg,
      inputModel: "SchemaOrg", inputModelVersion: "default",
      outputModel: "GWDM", outputModelVersion: "1.0",
    });
    expect(res.status).toBe(200);
  });

  it("HDRUK 2.1.2 → GWDM 1.0 (with extra) produces a summary", async () => {
    const res = await translate({
      metadata: M.hdrukv211,
      inputModel: "HDRUK", inputModelVersion: "2.1.2",
      outputModel: "GWDM", outputModelVersion: "1.0",
      extra: M.extra_hdrukv211,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body["summary"]).toBeTruthy();
  });

  it("GWDM 1.0 → HDRUK 2.1.2 (with extra) produces a summary", async () => {
    const res = await translate({
      metadata: M.gdmv1,
      inputModel: "GWDM", inputModelVersion: "1.0",
      outputModel: "HDRUK", outputModelVersion: "2.1.2",
      extra: M.extra_gdmv1,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body["summary"]).toBeTruthy();
  });

  it("auto-detects input → GWDM 1.0 (no input_schema specified)", async () => {
    const res = await translate({
      metadata: M.hdrukv211,
      outputModel: "GWDM", outputModelVersion: "1.0",
      extra: M.extra_hdrukv211,
    });
    expect(res.status).toBe(200);
  });

  it("subsection of GWDM 1.0 → HDRUK 2.1.2", async () => {
    const partial = { summary: M.gdmv1.summary };
    const res = await translate({
      metadata: partial,
      inputModel: "GWDM", inputModelVersion: "1.0",
      outputModel: "HDRUK", outputModelVersion: "2.1.2",
      extra: M.extra_gdmv1,
      subsection: "summary",
    });
    expect(res.status).toBe(200);
  });

  it("HDRUK 2.1.2 ↔ GWDM 1.1 round-trip preserves summary structure", async () => {
    const out = await translate({
      metadata: M.hdrukv211,
      inputModel: "HDRUK", inputModelVersion: "2.1.2",
      outputModel: "GWDM", outputModelVersion: "1.1",
      extra: M.extra_hdrukv211,
    });
    expect(out.status).toBe(200);
    expect((out.body as Record<string, unknown>)["summary"]).toBeTruthy();

    const back = await translate({
      metadata: out.body,
      inputModel: "GWDM", inputModelVersion: "1.1",
      outputModel: "HDRUK", outputModelVersion: "2.1.2",
    });
    expect(back.status).toBe(200);
    expect((back.body as Record<string, unknown>)["summary"]).toBeTruthy();
  });

  // ── Identity bypass ──────────────────────────────────────────────────────

  it("returns unchanged metadata when input == output (validation disabled)", async () => {
    const res = await translate({
      metadata: M.gdmv1,
      outputModel: "GWDM", outputModelVersion: "1.0",
      validateInput: "0",
      validateOutput: "0",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(M.gdmv1);
  });

  // ── validate_input / validate_output flags ───────────────────────────────

  it("accepts invalid input when validate_input=0", async () => {
    const res = await translate({
      metadata: { notARealField: true },
      inputModel: "HDRUK", inputModelVersion: "2.1.2",
      outputModel: "GWDM", outputModelVersion: "1.0",
      validateInput: "0",
      validateOutput: "0",
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when input fails validation with validate_input=1 (default)", async () => {
    const res = await translate({
      metadata: { notARealField: true },
      inputModel: "HDRUK", inputModelVersion: "2.1.2",
      outputModel: "GWDM", outputModelVersion: "1.0",
      validateInput: "1",
      validateOutput: "0",
    });
    expect(res.status).toBe(400);
    const body = res.body as { message: string; details: unknown };
    expect(body.message).toMatch(/input.*validation failed/i);
  });

  // ── Error paths ──────────────────────────────────────────────────────────

  it("returns 400 when output_schema given but output_version missing", async () => {
    const res = await translate({
      metadata: M.hdrukv211,
      outputModel: "GWDM",
      extra: M.extra_hdrukv211,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when metadata field is absent from body", async () => {
    const res = await translate({
      metadata: null as unknown as Record<string, unknown>,
      inputModel: "HDRUK", inputModelVersion: "2.1.2",
      outputModel: "GWDM", outputModelVersion: "1.0",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unrecognised input schema", async () => {
    const res = await translate({
      metadata: M.hdrukv211,
      inputModel: "UNKNOWN", inputModelVersion: "9.9.9",
      outputModel: "GWDM", outputModelVersion: "1.0",
      validateInput: "0",
    });
    expect(res.status).toBe(400);
    const body = res.body as { message: string };
    expect(body.message).toMatch(/cannot support the input model/i);
  });

  it("returns 400 for an unrecognised output schema", async () => {
    const res = await translate({
      metadata: M.hdrukv211,
      inputModel: "HDRUK", inputModelVersion: "2.1.2",
      outputModel: "UNKNOWN", outputModelVersion: "9.9.9",
      validateInput: "0",
    });
    expect(res.status).toBe(400);
    const body = res.body as { message: string };
    expect(body.message).toMatch(/cannot support the output model/i);
  });
});
