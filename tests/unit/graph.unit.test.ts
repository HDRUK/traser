import { describe, it, expect, vi } from "vitest";

// Multi-hop routing is driven by the template set fetched from TEMPLATES_LOCATION.
// Mock it with a synthetic set that has NO direct HDRUK:2.1.2 -> SchemaOrg edge,
// so routing MUST chain through GWDM:1.0 — no dependency on the live templates repo.
vi.mock("../../app/lib/templates.server", () => ({
  getAvailableTemplates: async () => [
    { input_model: "HDRUK", input_version: "2.1.2", output_model: "GWDM", output_version: "1.0" },
    { input_model: "GWDM", input_version: "1.0", output_model: "SchemaOrg", output_version: "default" },
    { input_model: "GWDM", input_version: "1.0", output_model: "HDRUK", output_version: "2.1.2" },
  ],
}));

import { TranslationGraph } from "../../app/lib/graph.server";

describe("multi-hop translation routing (graph.server)", () => {
  it("chains through an intermediate node when no direct edge exists", async () => {
    const g = await TranslationGraph.create();
    const start = "HDRUK:2.1.2";
    const end = "SchemaOrg:default";

    const predecessors = g.dijkstra(start);
    const { translationsToApply, error } = g.getPath(start, end, predecessors);

    expect(error).toBeUndefined();
    expect(translationsToApply?.map((t) => `${t.name}:${t.version}`)).toEqual([
      "HDRUK:2.1.2",
      "GWDM:1.0",
      "SchemaOrg:default",
    ]);
  });

  it("returns a 400 error (not 500) when no path exists", async () => {
    const g = await TranslationGraph.create();
    const predecessors = g.dijkstra("HDRUK:2.1.2");
    const { translationsToApply, error } = g.getPath("HDRUK:2.1.2", "CRUK:1.0", predecessors);

    expect(translationsToApply).toBeUndefined();
    expect(error?.status).toBe(400);
    expect(error?.message).toContain("unable to find a translation");
  });
});
