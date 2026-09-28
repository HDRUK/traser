import { useEffect, useMemo } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import Box from "@mui/material/Box";
import ErrorOutlineIcon from "@mui/icons-material/Error";
import LinearProgress from "@mui/material/LinearProgress";

import { getDatasetIndex, readTestResults, writeTestResults, clearAllDatasetFiles } from "~/lib/cache.server";
import { listSchemas } from "~/lib/traser.server";
import { runAllTests, runSingleDataset, isRefreshRunning, requestCancelRefresh } from "~/lib/refresh.server";
import { requireAdmin } from "~/lib/auth.server";
import { buildColumns } from "~/lib/results/columns";
import { AUTO_REVALIDATE_INTERVAL_MS } from "~/lib/results/constants";
import { FilterView, ResultsIntent, ResultsTab } from "~/lib/results/enums";
import type { CellStatus } from "~/lib/results/enums";
import { stripHeavyResultBodies } from "~/lib/results/slimResults";
import type { Dataset } from "~/lib/results/types";
import { resultsStore } from "~/stores/resultsStore";

import { FetchFailuresTab } from "~/components/results/FetchFailuresTab";
import { LogTab } from "~/components/results/LogTab";
import { OverviewTab } from "~/components/results/OverviewTab";
import { ResultsHeader } from "~/components/results/ResultsHeader";
import { ResultsTableView } from "~/components/results/ResultsTableView";
import { ResultsTabs } from "~/components/results/ResultsTabs";

import type { Route } from "./+types/results";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [datasets, schemas, cache] = await Promise.all([
    getDatasetIndex(),
    listSchemas(),
    readTestResults(),
  ]);

  if (cache.running && !isRefreshRunning()) {
    cache.running = false;
    cache.log = [
      ...(cache.log ?? []),
      `[${new Date().toTimeString().slice(0, 8)}] Detected stale running flag — reset (server restart or crash)`,
    ];
    await writeTestResults(cache);
  }

  const fetchFailures = Object.values(cache.fetchFailures ?? {}).sort(
    (a, b) => (a.lastFailedAt < b.lastFailedAt ? 1 : -1)
  );

  return {
    datasets,
    schemas,
    results: stripHeavyResultBodies(cache.results ?? {}),
    lastUpdated: cache.lastUpdated ?? null,
    running: cache.running ?? false,
    progress: cache.progress ?? null,
    log: cache.log ?? [],
    fetchFailures,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === ResultsIntent.Single) {
    const pid = formData.get("pid");
    if (typeof pid === "string" && pid) await runSingleDataset(pid);
    return { done: true };
  }

  if (intent === ResultsIntent.Cancel) {
    const cancelled = requestCancelRefresh();
    return cancelled ? { cancelled: true } : { error: "No refresh is currently running." };
  }

  if (intent === ResultsIntent.Deep) {
    await clearAllDatasetFiles();
    const cache = await readTestResults();
    cache.running = true;
    cache.results = {};
    cache.fetchFailures = {};
    cache.log = [];
    cache.progress = { completed: 0, total: 0 };
    await writeTestResults(cache);
    runAllTests().catch((err) => console.error("runAllTests deep error:", err));
    return { started: true };
  }

  const cache = await readTestResults();
  cache.running = true;
  cache.results ??= {};
  await writeTestResults(cache);

  runAllTests().catch((err) => console.error("runAllTests error:", err));
  return { started: true };
}

export function meta() {
  return [{ title: "Schema Test Results — TRASER" }];
}

function resolveActiveTab(tab: ResultsTab): ResultsTab {
  return (Object.values(ResultsTab) as string[]).includes(tab) ? tab : ResultsTab.Overview;
}

export default function ResultsPage() {
  const { datasets, schemas, results, lastUpdated, running, progress, log, fetchFailures } =
    useLoaderData<typeof loader>();

  const { revalidate } = useRevalidator();

  const {
    hiddenCols: hiddenColsArr, columnFilters: columnFiltersArr,
    activeTab, rowsPerPage,
    toggleHiddenCol, setColumnFilter, clearColumnFilter, clearAllColumnFilters,
    setActiveTab, setRowsPerPage,
  } = resultsStore();

  useEffect(() => {
    resultsStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => revalidate(), AUTO_REVALIDATE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [running, revalidate, progress]);

  const hiddenCols = useMemo(() => new Set(hiddenColsArr), [hiddenColsArr]);
  const columnFiltersByView = useMemo(() => {
    const build = (view: FilterView) =>
      Object.fromEntries(
        Object.entries(columnFiltersArr[view] ?? {}).map(([k, v]) => [k, new Set(v)])
      );
    return {
      [FilterView.Live]: build(FilterView.Live),
      [FilterView.Draft]: build(FilterView.Draft),
    };
  }, [columnFiltersArr]);

  const resolvedTab = resolveActiveTab(activeTab);

  const liveColumns = useMemo(() => buildColumns(schemas, true), [schemas]);
  const draftColumns = useMemo(() => buildColumns(schemas, false), [schemas]);
  const visibleLiveColumns = useMemo(
    () => liveColumns.filter((c) => !hiddenCols.has(c.key)),
    [liveColumns, hiddenCols]
  );
  const visibleDraftColumns = useMemo(
    () => draftColumns.filter((c) => !hiddenCols.has(c.key)),
    [draftColumns, hiddenCols]
  );

  const liveDatasets = useMemo(() => datasets.filter((d: Dataset) => d.status !== "DRAFT"), [datasets]);
  const draftDatasets = useMemo(() => datasets.filter((d: Dataset) => d.status === "DRAFT"), [datasets]);
  const draftCount = draftDatasets.length;

  const progressPct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;

  const sharedTableProps = {
    results,
    hiddenColCount: hiddenCols.size,
    rowsPerPage,
    setRowsPerPage,
  };

  const filterProps = (view: FilterView) => ({
    columnFilters: columnFiltersByView[view],
    setColumnFilter: (col: string, statuses: CellStatus[]) => setColumnFilter(view, col, statuses),
    clearColumnFilter: (col: string) => clearColumnFilter(view, col),
    clearAllColumnFilters: () => clearAllColumnFilters(view),
  });

  return (
    <Box sx={{ p: 3 }}>
      <ResultsHeader
        lastUpdated={lastUpdated}
        running={running}
        progressPct={progressPct}
        progressCompleted={progress?.completed ?? 0}
        progressTotal={progress?.total ?? 0}
        liveColumns={liveColumns}
        hiddenCols={hiddenCols}
        onToggleColumn={toggleHiddenCol}
      />

      {running && (
        <LinearProgress variant={progressPct !== null ? "determinate" : "indeterminate"}
          value={progressPct ?? undefined} sx={{ mb: 1.5, borderRadius: 1 }} />
      )}

      <ResultsTabs activeTab={resolvedTab} onChange={setActiveTab} tabs={[
        {
          value: ResultsTab.Overview,
          label: "Overview",
          content: <OverviewTab columns={visibleLiveColumns} datasets={datasets} results={results} />,
        },
        {
          value: ResultsTab.Live,
          label: "Live Results",
          content: (
            <ResultsTableView
              {...sharedTableProps}
              {...filterProps(FilterView.Live)}
              datasets={liveDatasets}
              visibleColumns={visibleLiveColumns}
              emptyMessage="No live datasets available."
            />
          ),
        },
        {
          value: ResultsTab.Draft,
          label: `Draft Results${draftCount > 0 ? ` (${draftCount})` : ""}`,
          content: (
            <ResultsTableView
              {...sharedTableProps}
              {...filterProps(FilterView.Draft)}
              datasets={draftDatasets}
              visibleColumns={visibleDraftColumns}
              emptyMessage="No draft datasets available."
            />
          ),
        },
        {
          value: ResultsTab.FetchFailures,
          label: `Fetch Failures${fetchFailures.length > 0 ? ` (${fetchFailures.length})` : ""}`,
          icon: fetchFailures.length > 0 ? <ErrorOutlineIcon sx={{ fontSize: 16, color: "error.main" }} /> : undefined,
          content: <FetchFailuresTab failures={fetchFailures} />,
        },
        {
          value: ResultsTab.Log,
          label: `Log${log.length > 0 ? ` (${log.length})` : ""}`,
          content: <LogTab log={log} running={running} />,
        },
      ]} />
    </Box>
  );
}
