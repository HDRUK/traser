import { describe, it, expect, afterEach } from "vitest";

import { envBoolean } from "../../app/lib/env.server";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("envBoolean (env.server)", () => {
  it("returns the fallback when unset, empty or whitespace", () => {
    delete process.env.FLAG;
    expect(envBoolean("FLAG", true)).toBe(true);
    expect(envBoolean("FLAG", false)).toBe(false);

    for (const value of ["", "   "]) {
      process.env.FLAG = value;
      expect(envBoolean("FLAG", true)).toBe(true);
      expect(envBoolean("FLAG", false)).toBe(false);
    }
  });

  it("reads 1 and true as true, whatever the fallback", () => {
    for (const value of ["1", "true", "True", " TRUE "]) {
      process.env.FLAG = value;
      expect(envBoolean("FLAG", false)).toBe(true);
    }
  });

  it("reads 0 and false as false, whatever the fallback", () => {
    for (const value of ["0", "false", "False", " FALSE "]) {
      process.env.FLAG = value;
      expect(envBoolean("FLAG", true)).toBe(false);
    }
  });

  it("throws on any other value rather than guessing", () => {
    for (const value of ["maybe", "yes", "no", "on", "off", "2"]) {
      process.env.FLAG = value;
      expect(() => envBoolean("FLAG", true)).toThrow(
        /FLAG must be one of 1, true, 0, false/
      );
    }
  });
});
