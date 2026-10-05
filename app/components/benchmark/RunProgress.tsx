import { useFetcher } from "react-router";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Button } from "@hdruk/ui";
import type { BenchmarkRun } from "~/lib/benchmarkStorage.server";
import { BenchmarkIntent } from "~/lib/benchmark/enums";
import { RUN_FORM_MAX_WIDTH } from "~/lib/benchmark/constants";
import { BenchmarkLogPanel } from "./BenchmarkLogPanel";

export function RunProgress({ run }: { run: BenchmarkRun }) {
  const cancelFetcher = useFetcher();
  const progress = run.progress;
  const pct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;

  return (
    <Box sx={{ mt: 2, maxWidth: RUN_FORM_MAX_WIDTH }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {progress?.completed ?? 0} / {progress?.total ?? 0} ({pct ?? 0}%)
        </Typography>
        <cancelFetcher.Form method="post">
          <input type="hidden" name="intent" value={BenchmarkIntent.Cancel} />
          <Tooltip title="Stop this run — useful if it looks stuck (e.g. a slow/unresponsive endpoint)">
            <span>
              <Button type="submit" size="small" purpose="secondary" disabled={cancelFetcher.state !== "idle"}>
                Cancel
              </Button>
            </span>
          </Tooltip>
        </cancelFetcher.Form>
      </Box>
      <LinearProgress variant={pct !== null ? "determinate" : "indeterminate"} value={pct ?? undefined} sx={{ borderRadius: 1 }} />
      <BenchmarkLogPanel log={run.log} running={run.running} />
    </Box>
  );
}
