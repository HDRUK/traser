import { describe, it, expect } from "vitest";
import { BASE_URL } from "./helpers";

describe("app", () => {
  it("GET / responds 200 (home page renders)", async () => {
    const res = await fetch(BASE_URL + "/");
    expect(res.status).toBe(200);
  });

  it("GET /no-such-route responds 404", async () => {
    const res = await fetch(BASE_URL + "/no-such-route-zzz");
    expect(res.status).toBe(404);
  });
});
