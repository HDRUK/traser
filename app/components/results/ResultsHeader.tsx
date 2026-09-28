import { useState } from "react";
import { useFetcher } from "react-router";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Button } from "@hdruk/ui";
import RefreshIcon from "@mui/icons-material/Refresh";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import { ResultsIntent } from "~/lib/results/enums";
import type { Column } from "~/lib/results/types";
import { SchemasMenu } from "./SchemasMenu";

interface ResultsHeaderProps {
  lastUpdated: string | null;
  running: boolean;
  progressPct: number | null;
  progressCompleted: number;
  progressTotal: number;
  liveColumns: Column[];
  hiddenCols: Set<string>;
  onToggleColumn: (key: string) => void;
}

export function ResultsHeader({
  lastUpdated, running, progressPct, progressCompleted, progressTotal,
  liveColumns, hiddenCols, onToggleColumn,
}: ResultsHeaderProps) {
  const fetcher = useFetcher();
  const cancelFetcher = useFetcher();
  const [colMenuAnchor, setColMenuAnchor] = useState<HTMLElement | null>(null);
  const isRefreshAllBusy = running || fetcher.state !== "idle";

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1.5 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Schema Test Results</Typography>

      {lastUpdated && !running && (
        <Typography variant="caption" color="text.secondary">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </Typography>
      )}

      {running && (
        <Typography variant="caption" color="text.secondary">
          {progressCompleted} / {progressTotal} ({progressPct}%)
        </Typography>
      )}

      {running && (
        <cancelFetcher.Form method="post">
          <input type="hidden" name="intent" value={ResultsIntent.Cancel} />
          <Tooltip title="Stop this refresh — it can be started again afterwards">
            <span>
              <Button type="submit" size="small" variant="outlined"
                disabled={cancelFetcher.state !== "idle"}>
                Cancel
              </Button>
            </span>
          </Tooltip>
        </cancelFetcher.Form>
      )}

      <Button size="small" variant="contained" color="inherit" startIcon={<ViewColumnIcon />}
        onClick={(e) => setColMenuAnchor(e.currentTarget)}
        sx={{ bgcolor: "action.selected", "&:hover": { bgcolor: "action.focus" } }}>
        Schemas
      </Button>
      <SchemasMenu
        anchorEl={colMenuAnchor}
        onClose={() => setColMenuAnchor(null)}
        columns={liveColumns}
        hiddenCols={hiddenCols}
        onToggleColumn={onToggleColumn}
      />

      <Box sx={{ display: "flex", gap: 1 }}>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value={ResultsIntent.All} />
          <Tooltip title="Fetch new datasets from the API (retrying any previous fetch failures) and test any uncached schema combinations">
            <span>
              <Button type="submit" variant="contained"
                startIcon={isRefreshAllBusy ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                disabled={isRefreshAllBusy} size="small">
                Sync New
              </Button>
            </span>
          </Tooltip>
        </fetcher.Form>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value={ResultsIntent.Deep} />
          <Tooltip title="Clear all cached datasets and test results, then re-download and re-test everything from scratch">
            <span>
              <Button type="submit" variant="outlined" color="error"
                startIcon={isRefreshAllBusy ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                disabled={isRefreshAllBusy} size="small">
                Deep Refresh
              </Button>
            </span>
          </Tooltip>
        </fetcher.Form>
      </Box>
    </Box>
  );
}
