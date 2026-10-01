import { useEffect } from "react";
import { useFetcher } from "react-router";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { BenchmarkRun, BenchmarkRunSummary } from "~/lib/benchmarkStorage.server";
import { BenchmarkIntent } from "~/lib/benchmark/enums";
import { RunConfigForm } from "./RunConfigForm";
import { RunProgress } from "./RunProgress";

interface RunTabProps {
  runningRun: BenchmarkRun | null;
  duplicateFrom: BenchmarkRunSummary | null;
  onConsumeDuplicate: () => void;
  defaultBaseUrl: string;
  allowedHosts: string[];
}

export function RunTab({ runningRun, duplicateFrom, onConsumeDuplicate, defaultBaseUrl, allowedHosts }: RunTabProps) {
  const fetcher = useFetcher<{ started?: boolean; error?: string }>();
  const busy = runningRun != null || fetcher.state !== "idle";

  // Once a duplicated run's config has been submitted, clear it so a later
  // visit to this tab starts from the plain defaults again.
  useEffect(() => {
    if (fetcher.data?.started) onConsumeDuplicate();
  }, [fetcher.data, onConsumeDuplicate]);

  return (
    <Box>
      {duplicateFrom && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Prefilled from <strong>{duplicateFrom.label}</strong> — edit and start when ready.
        </Typography>
      )}
      {/* key remounts the form (and its uncontrolled defaultValues) whenever the duplicate source changes */}
      <fetcher.Form method="post" key={duplicateFrom?.id ?? "blank"}>
        <input type="hidden" name="intent" value={BenchmarkIntent.Start} />
        <RunConfigForm
          busy={busy}
          error={fetcher.data?.error}
          duplicateFrom={duplicateFrom}
          defaultBaseUrl={defaultBaseUrl}
          allowedHosts={allowedHosts}
        />
      </fetcher.Form>

      {runningRun && <RunProgress run={runningRun} />}
    </Box>
  );
}
