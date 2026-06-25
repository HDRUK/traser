import { describe, it, expect } from "vitest";
import { BASE_URL } from "./helpers";

describe("GET /list/templates", () => {
  it("returns 200 with an array of templates", async () => {
    const res = await fetch(BASE_URL + "/list/templates");
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("GET /list/schemas", () => {
  it("returns 200 with HDRUK, GWDM, SchemaOrg as arrays of version strings", async () => {
    const res = await fetch(BASE_URL + "/list/schemas");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(expect.arrayContaining(["SchemaOrg", "HDRUK", "GWDM"]));
    for (const versions of Object.values(body)) {
      expect(Array.isArray(versions)).toBe(true);
      for (const v of versions as unknown[]) {
        expect(typeof v).toBe("string");
      }
    }
  });
});

describe("GET /list/translations", () => {
  it("returns 200 with an array of route strings for HDRUK 2.1.2", async () => {
    const res = await fetch(`${BASE_URL}/list/translations?schema=HDRUK&version=2.1.2`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const route of body) {
      expect(typeof route).toBe("string");
    }
  });

  it("includes the identity route (HDRUK:2.1.2) in results", async () => {
    const res = await fetch(`${BASE_URL}/list/translations?schema=HDRUK&version=2.1.2`);
    const routes = await res.json() as string[];
    expect(routes).toContain("HDRUK:2.1.2");
  });

  it("returns 400 when schema and version params are missing", async () => {
    const res = await fetch(`${BASE_URL}/list/translations`);
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/schema.*version/i);
  });

  it("returns 400 when only schema param is provided", async () => {
    const res = await fetch(`${BASE_URL}/list/translations?schema=HDRUK`);
    expect(res.status).toBe(400);
  });
});

describe("GET /list/datasets", () => {
  it("returns 200 with an array", async () => {
    const res = await fetch(BASE_URL + "/list/datasets");
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("each dataset entry has a pid and title", async () => {
    const res = await fetch(BASE_URL + "/list/datasets");
    const body = await res.json() as Array<{ pid: string; title: string }>;
    for (const entry of body) {
      expect(typeof entry.pid).toBe("string");
      expect(typeof entry.title).toBe("string");
    }
  });
});
