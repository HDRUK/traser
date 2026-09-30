import { describe, it, expect, afterEach } from "vitest";

import {
  allowedBenchmarkHosts,
  benchmarkBaseUrlError,
  defaultBenchmarkBaseUrl,
  DEFAULT_BENCHMARK_HOSTS,
} from "../../app/lib/benchmark/allowedHosts.server";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("allowedBenchmarkHosts", () => {
  it("defaults to the three Gateway environments when neither variable is set", () => {
    delete process.env.BENCHMARK_ALLOWED_HOSTS;
    delete process.env.GATEWAY_API_URL;
    expect(allowedBenchmarkHosts()).toEqual(DEFAULT_BENCHMARK_HOSTS);
    expect(DEFAULT_BENCHMARK_HOSTS).toEqual([
      "api.prod.hdruk.cloud",
      "api.preprod.hdruk.cloud",
      "api.dev.hdruk.cloud",
    ]);
    expect(defaultBenchmarkBaseUrl()).toBe("");
  });

  it("adds the GATEWAY_API_URL host to the defaults when it is not already one", () => {
    delete process.env.BENCHMARK_ALLOWED_HOSTS;
    process.env.GATEWAY_API_URL = "http://localhost:8100/api/v2";
    expect(allowedBenchmarkHosts()).toEqual([...DEFAULT_BENCHMARK_HOSTS, "localhost"]);
  });

  it("does not duplicate the GATEWAY_API_URL host when it is already a default", () => {
    delete process.env.BENCHMARK_ALLOWED_HOSTS;
    process.env.GATEWAY_API_URL = "https://api.prod.hdruk.cloud/api/v2";
    expect(allowedBenchmarkHosts()).toEqual(DEFAULT_BENCHMARK_HOSTS);
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
  it("accepts each default Gateway host with no configuration at all", () => {
    delete process.env.BENCHMARK_ALLOWED_HOSTS;
    delete process.env.GATEWAY_API_URL;
    for (const host of DEFAULT_BENCHMARK_HOSTS) {
      expect(benchmarkBaseUrlError(`https://${host}/api/v2`)).toBeNull();
    }
    expect(benchmarkBaseUrlError("https://api.unlisted.test/api/v2")).toMatch(/not in the benchmark allow-list/);
  });

  it("rejects every URL when the allow-list is set but empty", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = " , ";
    expect(benchmarkBaseUrlError("https://api.prod.hdruk.cloud/api/v2")).toMatch(/set but empty/);
  });

  it("accepts a host on the list, on any path or port", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = "api.preprod.hdruk.cloud,localhost";
    expect(benchmarkBaseUrlError("https://api.preprod.hdruk.cloud/api/v2")).toBeNull();
    expect(benchmarkBaseUrlError("http://localhost:8100/api/v2")).toBeNull();
    expect(benchmarkBaseUrlError("https://API.PREPROD.hdruk.cloud/api/v2")).toBeNull();
  });

  it("rejects an unlisted host, including the cloud metadata endpoint", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = "api.preprod.hdruk.cloud";
    expect(benchmarkBaseUrlError("https://api.unlisted.test/api/v2")).toMatch(/not in the benchmark allow-list/);
    expect(benchmarkBaseUrlError("http://localhost:8100/api/v2")).toMatch(/not in the benchmark allow-list/);
    expect(benchmarkBaseUrlError("http://169.254.169.254/latest/meta-data")).toMatch(/not in the benchmark allow-list/);
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

  it("reads the host after the @, not the userinfo before it", () => {
    process.env.BENCHMARK_ALLOWED_HOSTS = "api.preprod.hdruk.cloud";
    expect(benchmarkBaseUrlError("https://api.preprod.hdruk.cloud@api.unlisted.test/api/v2")).toMatch(/not in the benchmark allow-list/);
  });
});
