import { describe, it, expect } from "vitest";
import { BASE_URL, sampleMetadata } from "./helpers";

describe("POST /find", () => {
  it("identifies GWDM 1.0 metadata", async () => {
    const res = await fetch(`${BASE_URL}/find?with_errors=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleMetadata.gdmv1),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ name: string; version: string; matches: boolean }>;
    const found = body.find((i) => i.name === "GWDM" && i.version === "1.0");
    expect(found?.matches).toBe(true);
  });

  it("identifies HDRUK 2.1.2 metadata", async () => {
    const res = await fetch(`${BASE_URL}/find?with_errors=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleMetadata.hdrukv211),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ name: string; version: string; matches: boolean }>;
    const found = body.find((i) => i.name === "HDRUK" && i.version === "2.1.2");
    expect(found?.matches).toBe(true);
  });

  it("returns 400 when content-type is not application/json", async () => {
    const res = await fetch(`${BASE_URL}/find`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(sampleMetadata.gdmv1),
    });
    expect(res.status).toBe(400);
    // Old service returned express-validator error objects (with `.msg`), not
    // plain strings — restored so consumers reading errors[0].msg keep working.
    const body = (await res.json()) as { errors: Array<{ msg: string }> };
    expect(body.errors[0].msg).toBe("Invalid content type. Expected JSON.");
  });

  it("returns non-matching entry for metadata that matches no schema", async () => {
    const res = await fetch(`${BASE_URL}/find?with_errors=0`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totallyUnknownField: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ matches: boolean }>;
    const anyMatch = body.some((i) => i.matches);
    expect(anyMatch).toBe(false);
  });
});
