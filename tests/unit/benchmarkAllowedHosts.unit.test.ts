import { describe, it, expect, afterEach } from "vitest";

import {
  allowedBenchmarkHosts,
  benchmarkBaseUrlError,
  defaultBenchmarkBaseUrl,
} from "../../app/lib/benchmark/allowedHosts.server";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("allowedBenchmarkHosts", () => {
  it("falls back to the GATEWAY_API_URL host when the allow-list is unset", () => {
    delete process.env.BENCHMARK_ALLOWED_HOSTS;
    process.env.GATEWAY_API_URL = "https://api.prod.hdruk.cloud/api/v2";
    expect(allowedBenchmarkHosts()).toEqual(["api.prod.hdruk.cloud"]);
  });

  it("is empty when neither variable is set, so nothing is reachable by default", () => {
    delete process.env.BENCHMARK_ALLOWED_HOSTS;
    delete process.env.GATEWAY_API_URL;
    expect(allowedBenchmarkHosts()).toEqual([]);
    expect(defaultBenchmarkBaseUrl()).toBe("");
  });

  it("splits, trims and lowercases a configured list", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = " API.Prod.hdruk.cloud , api.preprod.hdruk.cloud ,, ";
    expect(allowedBenchmarkHosts()).toEqual(["api.prod.hdruk.cloud", "api.preprod.hdruk.cloud"]);
  });

  it("ignores GATEWAY_API_URL once an explicit list is configured", () => {
    process.env.GATEWAY_API_URL = "https://api.prod.hdruk.cloud/api/v2";
    process.env.BENCHMARK_ALLOWED_HOSTS = "api.preprod.hdruk.cloud";
    expect(allowedBenchmarkHosts()).toEqual(["api.preprod.hdruk.cloud"]);
  });
});

describe("benchmarkBaseUrlError", () => {
  it("rejects every URL when no host is configured", () => {
    delete process.env.BENCHMARK_ALLOWED_HOSTS;
    delete process.env.GATEWAY_API_URL;
    expect(benchmarkBaseUrlError("https://api.prod.hdruk.cloud/api/v2")).toMatch(/No benchmark hosts are configured/);
  });

  it("accepts a host on the list, on any path or port", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = "api.preprod.hdruk.cloud,localhost";
    expect(benchmarkBaseUrlError("https://api.preprod.hdruk.cloud/api/v2")).toBeNull();
    expect(benchmarkBaseUrlError("http://localhost:8100/api/v2")).toBeNull();
    expect(benchmarkBaseUrlError("https://API.PREPROD.hdruk.cloud/api/v2")).toBeNull();
  });

  it("rejects a host that is not on the list", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = "api.preprod.hdruk.cloud";
    expect(benchmarkBaseUrlError("http://169.254.169.254/latest/meta-data")).toMatch(/not in the benchmark allow-list/);
    expect(benchmarkBaseUrlError("http://localhost:8100/api/v2")).toMatch(/not in the benchmark allow-list/);
  });

  it("rejects a subdomain or suffix that merely resembles an allowed host", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = "api.preprod.hdruk.cloud";
    expect(benchmarkBaseUrlError("https://api.preprod.hdruk.cloud.attacker.test/api/v2")).toMatch(/not in the benchmark allow-list/);
    expect(benchmarkBaseUrlError("https://evil-api.preprod.hdruk.cloud/api/v2")).toMatch(/not in the benchmark allow-list/);
  });

  it("rejects non-http protocols and unparseable URLs", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = "api.preprod.hdruk.cloud";
    expect(benchmarkBaseUrlError("file:///etc/passwd")).toMatch(/http or https/);
    expect(benchmarkBaseUrlError("api.preprod.hdruk.cloud/api/v2")).toMatch(/valid absolute URL/);
  });

  it("rejects credentials-in-URL pointing at an unlisted host", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = "api.preprod.hdruk.cloud";
    expect(benchmarkBaseUrlError("https://api.preprod.hdruk.cloud@169.254.169.254/")).toMatch(/not in the benchmark allow-list/);
  });
});
