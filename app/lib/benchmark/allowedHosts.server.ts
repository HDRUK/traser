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

export function allowedBenchmarkHosts(): string[] {
  const configured = process.env.BENCHMARK_ALLOWED_HOSTS;
  if (configured !== undefined) {
    return configured
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }

  const gatewayHost = hostnameOf(defaultBenchmarkBaseUrl());
  return gatewayHost ? [gatewayHost] : [];
}

export function benchmarkBaseUrlError(baseUrl: string): string | null {
  const allowed = allowedBenchmarkHosts();
  if (allowed.length === 0) {
    return "No benchmark hosts are configured — set BENCHMARK_ALLOWED_HOSTS (or GATEWAY_API_URL) before starting a run.";
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
