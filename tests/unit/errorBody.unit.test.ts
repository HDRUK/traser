import { describe, it, expect } from "vitest";
import { formatErrorBody } from "../../app/lib/errorBody";

describe("formatErrorBody", () => {
  it("returns non-JSON input unchanged", () => {
    expect(formatErrorBody("Bad Gateway")).toBe("Bad Gateway");
  });

  it("pretty-prints a plain JSON body", () => {
    expect(formatErrorBody('{"message":"nope"}')).toBe('{\n  "message": "nope"\n}');
  });

  it("expands the Gateway's escaped-JSON details string", () => {
    const inner = JSON.stringify({
      message: "Input metadata validation failed",
      details: { validationErrors: [{ instancePath: "/required/issued", keyword: "format" }] },
    });
    const body = JSON.stringify({ message: "failed to translate", details: inner });

    const formatted = formatErrorBody(body);

    expect(formatted).toContain('"instancePath": "/required/issued"');
    expect(formatted).not.toContain("\\\"");
  });

  it("leaves the useful head within the first 2000 characters", () => {
    const inner = JSON.stringify({
      message: "Input metadata validation failed",
      details: {
        validationErrors: [{ instancePath: "/required/issued", message: "must match format \"date-time\"" }],
        data: { description: "x".repeat(5000) },
      },
    });
    const body = JSON.stringify({ message: "failed to translate", details: inner });

    const head = formatErrorBody(body).slice(0, 2000);

    expect(head).toContain("must match format");
  });
});
