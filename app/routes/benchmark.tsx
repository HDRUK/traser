import { useEffect, useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { randomUUID } from "node:crypto";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { requireAdmin } from "~/lib/auth.server";
import {
  readIndex,
  writeIndex,
  readRun,
  writeRun,
  upsertIndexEntry,
  toSummary,
  deleteRun as deleteRunFile,
  type BenchmarkRunSummary,
} from "~/lib/benchmarkStorage.server";
import {
  startBenchmark,
  buildInitialRun,
  acquireBenchmarkLease,
  isBenchmarkRunning,
  requestCancel,
  buildComparison,
  MAX_WORK_ITEMS,
  type RunComparison,
} from "~/lib/benchmark.server";
import {
  allowedBenchmarkHosts,
  benchmarkBaseUrlError,
  defaultBenchmarkBaseUrl,
} from "~/lib/benchmark/allowedHosts.server";
import { BenchmarkIntent, BenchmarkTab } from "~/lib/benchmark/enums";
import { RUN_POLL_INTERVAL_MS } from "~/lib/benchmark/constants";

import { BenchmarkTabs } from "~/components/benchmark/BenchmarkTabs";
import { CompareTab } from "~/components/benchmark/CompareTab";
import { HistoryTab } from "~/components/benchmark/HistoryTab";
import { RunTab } from "~/components/benchmark/RunTab";

import type { Route } from "./+types/benchmark";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const compareA = url.searchParams.get("compareA");
  const compareB = url.searchParams.get("compareB");

  const index = await readIndex();

  // The lease is the only source of truth for "a run is in progress" — a run
  // whose owner died leaves a running:true record behind, and the lapsed lease
  // is what tells us to clear it, on whichever instance serves this request.
  const leaseHeld = await isBenchmarkRunning().catch((err) => {
    console.error("[benchmark] could not read the benchmark lease:", err);
    return true;
  });

  let indexChanged = false;
  for (const entry of index) {
    if (entry.running && !leaseHeld) {
      entry.running = false;
      indexChanged = true;
      const run = await readRun(entry.id);
      if (run) {
        run.running = false;
        run.log = [...run.log, `[${ts()}] Detected stale running flag — reset (server restart or crash)`];
        await writeRun(run);
      }
    }
  }
  if (indexChanged) await writeIndex(index);

  const runningEntry = index.find((e) => e.running);
  const runningRun = runningEntry ? await readRun(runningEntry.id) : null;

  let comparison: RunComparison | null = null;
  let statsA: BenchmarkRunSummary["stats"] = undefined;
  let statsB: BenchmarkRunSummary["stats"] = undefined;
  let labelA: string | null = null;
  let labelB: string | null = null;

  if (compareA && compareB) {
    const [runA, runB] = await Promise.all([readRun(compareA), readRun(compareB)]);
    if (runA && runB) {
      comparison = buildComparison(runA, runB);
      statsA = runA.stats;
      statsB = runB.stats;
      labelA = runA.label;
      labelB = runB.label;
    }
  }

  return {
    index,
    runningRun,
    comparison,
    compareA,
    compareB,
    statsA,
    statsB,
    labelA,
    labelB,
    defaultBaseUrl: defaultBenchmarkBaseUrl(),
    allowedHosts: allowedBenchmarkHosts(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === BenchmarkIntent.Start) {

    const label = String(formData.get("label") ?? "").trim();
    const baseUrl = String(formData.get("baseUrl") ?? "").trim();
    const schemaModel = String(formData.get("schemaModel") ?? "").trim();
    const schemaVersion = String(formData.get("schemaVersion") ?? "").trim();
    const start = Number(formData.get("start"));
    const end = Number(formData.get("end"));
    const repeat = Number(formData.get("repeat"));
    const concurrency = Number(formData.get("concurrency"));

    if (!label) return { error: "Label is required." };
    if (!baseUrl) return { error: "Base URL is required." };

    const baseUrlError = benchmarkBaseUrlError(baseUrl);
    if (baseUrlError) return { error: baseUrlError };

    if (!schemaModel) return { error: "Schema model is required." };
    if (!schemaVersion) return { error: "Schema version is required." };
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      return { error: "Invalid ID range." };
    }
    if (!Number.isInteger(repeat) || repeat < 1) return { error: "Repeat count must be ≥ 1." };
    if (!Number.isInteger(concurrency) || concurrency < 1) return { error: "Concurrency must be ≥ 1." };

    const totalWork = (end - start + 1) * repeat;
    if (totalWork > MAX_WORK_ITEMS) {
      return { error: `Range × repeat = ${totalWork.toLocaleString()} exceeds the ${MAX_WORK_ITEMS.toLocaleString()} cap. Narrow the range or lower repeat.` };
    }

    const index = await readIndex();
    if (index.some((e) => e.label.toLowerCase() === label.toLowerCase())) {
      return { error: `Label "${label}" is already in use — pick another.` };
    }

    const runId = randomUUID();
    const opts = { runId, label, baseUrl, schemaModel, schemaVersion, start, end, repeat, concurrency };

    // Claim the slot before anything is persisted, so a second instance taking
    // the same click cannot also write a running record.
    const lease = await acquireBenchmarkLease();
    if (!lease) return { error: "A benchmark is already running." };

    // Persist the "running" record BEFORE firing the background job — startBenchmark()
    // itself starts with a real network call (id discovery) that can take a moment,
    // and this action returns immediately without awaiting it. Without this, the
    // fetcher's post-action revalidation can read index.json before any run exists
    // there, making the first click look like it did nothing.
    const initialRun = buildInitialRun(opts);
    await writeRun(initialRun);
    await upsertIndexEntry(toSummary(initialRun));

    startBenchmark(initialRun, opts).catch((err) => console.error("startBenchmark error:", err));
    return { started: true, runId };
  }

  if (intent === BenchmarkIntent.Cancel) {
    const cancelled = await requestCancel();
    return cancelled ? { cancelled: true } : { error: "No benchmark is currently running." };
  }

  if (intent === BenchmarkIntent.Delete) {
    const runId = String(formData.get("runId") ?? "");
    const index = await readIndex();
    if (index.find((e) => e.id === runId)?.running) {
      return { error: "Cannot delete a run that is currently in progress." };
    }
    await deleteRunFile(runId);
    return { deleted: true };
  }

  return { error: "Unknown intent." };
}

export function meta() {
  return [{ title: "Endpoint Benchmark — TRASER" }];
}

export default function BenchmarkPage() {
  const {
    index, runningRun, comparison, compareA, compareB, statsA, statsB, labelA, labelB,
    defaultBaseUrl, allowedHosts,
  } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const [tab, setTab] = useState<BenchmarkTab>(compareA && compareB ? BenchmarkTab.Compare : BenchmarkTab.Run);
  const [duplicateFrom, setDuplicateFrom] = useState<BenchmarkRunSummary | null>(null);

  useEffect(() => {
    if (!runningRun) return;
    const timer = setTimeout(() => revalidate(), RUN_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [runningRun, revalidate]);

  const tabs = [
    {
      value: BenchmarkTab.Run,
      label: "Run",
      content: (
        <RunTab
          runningRun={runningRun}
          duplicateFrom={duplicateFrom}
          onConsumeDuplicate={() => setDuplicateFrom(null)}
          defaultBaseUrl={defaultBaseUrl}
          allowedHosts={allowedHosts}
        />
      ),
    },
    {
      value: BenchmarkTab.History,
      label: `History${index.length > 0 ? ` (${index.length})` : ""}`,
      content: (
        <HistoryTab
          index={index}
          onDuplicate={(run) => { setDuplicateFrom(run); setTab(BenchmarkTab.Run); }}
        />
      ),
    },
    {
      value: BenchmarkTab.Compare,
      label: "Compare",
      content: (
        <CompareTab
          index={index}
          comparison={comparison}
          compareA={compareA}
          compareB={compareB}
          statsA={statsA}
          statsB={statsB}
          labelA={labelA}
          labelB={labelB}
        />
      ),
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Endpoint Benchmark</Typography>
      <BenchmarkTabs tabs={tabs} activeTab={tab} onChange={setTab} />
    </Box>
  );
}
