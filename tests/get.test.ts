import { describe, it, expect } from "vitest";
import { BASE_URL } from "./helpers";

describe("GET /get/schema", () => {
  it("returns schema envelope for HDRUK 2.1.2", async () => {
    const res = await fetch(`${BASE_URL}/get/schema?name=HDRUK&version=2.1.2`);
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; version: string; schema: unknown };
    expect(body.name).toBe("HDRUK");
    expect(body.version).toBe("2.1.2");
    expect(body.schema).toBeTruthy();
  });

  it("returns schema envelope for GWDM 1.0", async () => {
    const res = await fetch(`${BASE_URL}/get/schema?name=GWDM&version=1.0`);
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; version: string; schema: unknown };
    expect(body.name).toBe("GWDM");
    expect(body.version).toBe("1.0");
    expect(body.schema).toBeTruthy();
  });

  it("returns 400 when name param is missing", async () => {
    const res = await fetch(`${BASE_URL}/get/schema?version=2.1.2`);
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/name/i);
  });

  it("returns 400 for an unknown schema", async () => {
    const res = await fetch(`${BASE_URL}/get/schema?name=UNKNOWN&version=9.9.9`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });
});

describe("GET /get/map", () => {
  it("returns map envelope for HDRUK 2.1.2 → GWDM 1.0", async () => {
    const params = new URLSearchParams({
      input_schema: "HDRUK",
      input_version: "2.1.2",
      output_schema: "GWDM",
      output_version: "1.0",
    });
    const res = await fetch(`${BASE_URL}/get/map?${params}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { input_schema: string; output_schema: string; translation_map: string };
    expect(body.input_schema).toBe("HDRUK");
    expect(body.output_schema).toBe("GWDM");
    expect(typeof body.translation_map).toBe("string");
    expect(body.translation_map.length).toBeGreaterThan(0);
  });

  it("returns 400 when any required param is missing", async () => {
    const res = await fetch(`${BASE_URL}/get/map?input_schema=HDRUK&input_version=2.1.2`);
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/required/i);
  });
});

describe("GET /get/form_hydration", () => {
  it("returns 200 for HDRUK 2.2.1", async () => {
    const res = await fetch(`${BASE_URL}/get/form_hydration?name=HDRUK&version=2.2.1`);
    expect(res.status).toBe(200);
  });

  it("returns 200 with dataTypes filter", async () => {
    const params = new URLSearchParams({
      name: "HDRUK",
      version: "2.2.1",
      dataTypes: "Imaging types, Lifestyle",
    });
    const res = await fetch(`${BASE_URL}/get/form_hydration?${params}`);
    expect(res.status).toBe(200);
  });
});

describe("GET /get/dataset", () => {
  it("returns 400 when pid param is missing", async () => {
    const res = await fetch(`${BASE_URL}/get/dataset`);
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/pid/i);
  });

  it("returns 404 for an unknown pid", async () => {
    const res = await fetch(`${BASE_URL}/get/dataset?pid=nonexistent-pid-zzz-99999`);
    expect(res.status).toBe(404);
  });

  it("returns metadata for a known pid when datasets are available", async () => {
    const listRes = await fetch(`${BASE_URL}/list/datasets`);
    const datasets = await listRes.json() as Array<{ pid: string }>;
    if (datasets.length === 0) return;

    const { pid } = datasets[0];
    const res = await fetch(`${BASE_URL}/get/dataset?pid=${encodeURIComponent(pid)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
  });
});
