function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function defaultBenchmarkBaseUrl(): string {
  return process.env.GATEWAY_API_URL ?? "";
}

export const DEFAULT_BENCHMARK_HOSTS = [
  "api.prod.hdruk.cloud",
  "api.preprod.hdruk.cloud",
  "api.dev.hdruk.cloud",
];

export function allowedBenchmarkHosts(): string[] {
  const configured = process.env.BENCHMARK_ALLOWED_HOSTS;
  if (configured !== undefined) {
    return configured
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }

  const gatewayHost = hostnameOf(defaultBenchmarkBaseUrl());
  return gatewayHost && !DEFAULT_BENCHMARK_HOSTS.includes(gatewayHost)
    ? [...DEFAULT_BENCHMARK_HOSTS, gatewayHost]
    : DEFAULT_BENCHMARK_HOSTS;
}

export function benchmarkBaseUrlError(baseUrl: string): string | null {
  const allowed = allowedBenchmarkHosts();
  if (allowed.length === 0) {
    return "BENCHMARK_ALLOWED_HOSTS is set but empty, so no host is permitted. Unset it to fall back to the default Gateway hosts.";
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return "Base URL must be a valid absolute URL.";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Base URL must use http or https.";
  }

  if (!allowed.includes(url.hostname.toLowerCase())) {
    return `Host "${url.hostname}" is not in the benchmark allow-list (${allowed.join(", ")}). Set BENCHMARK_ALLOWED_HOSTS to permit it.`;
  }

  return null;
}
