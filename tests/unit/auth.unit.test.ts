import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { isAuthEnforced, getUser, requireAdmin } from "../../app/lib/auth.server";

const originalEnv = { ...process.env };

function setEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  setEnv({ AUTH_ENFORCED: undefined, JWT_SECRET: undefined });
});

afterEach(() => {
  process.env = { ...originalEnv };
});

const anonymousRequest = () => new Request("http://localhost:3001/results");

describe("auth enforcement flag (auth.server)", () => {
  it("enforces when the flag is unset", () => {
    expect(isAuthEnforced()).toBe(true);
  });

  it("disables the token checks when the flag is off", () => {
    setEnv({ AUTH_ENFORCED: "0" });
    expect(isAuthEnforced()).toBe(false);
    setEnv({ AUTH_ENFORCED: "False" });
    expect(isAuthEnforced()).toBe(false);
  });

  it("enforces when the flag is on", () => {
    setEnv({ AUTH_ENFORCED: "1" });
    expect(isAuthEnforced()).toBe(true);
  });

  it("enforces for an unrecognised value", () => {
    setEnv({ AUTH_ENFORCED: "maybe" });
    expect(isAuthEnforced()).toBe(true);
  });

  it("rejects an anonymous request while enforced", async () => {
    expect(await getUser(anonymousRequest())).toBeNull();
    await expect(requireAdmin(anonymousRequest())).rejects.toBeDefined();
  });

  it("grants an admin user to an anonymous request while disabled", async () => {
    setEnv({ AUTH_ENFORCED: "0" });
    expect(await getUser(anonymousRequest())).toMatchObject({ is_admin: 1 });
    await expect(requireAdmin(anonymousRequest())).resolves.toMatchObject({ is_admin: 1 });
  });
});
