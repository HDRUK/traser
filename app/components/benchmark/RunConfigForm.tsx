import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Button, Loading } from "@hdruk/ui";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import type { BenchmarkRunSummary } from "~/lib/benchmarkStorage.server";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_ID_RANGE_END,
  DEFAULT_ID_RANGE_START,
  DEFAULT_REPEAT,
  DEFAULT_SCHEMA_MODEL,
  DEFAULT_SCHEMA_VERSION,
  RUN_FORM_MAX_WIDTH,
} from "~/lib/benchmark/constants";

const BASE_URL_PLACEHOLDER = "https://<gateway-api-host>/api/v2";

interface RunConfigFormProps {
  busy: boolean;
  error?: string;
  duplicateFrom: BenchmarkRunSummary | null;
  defaultBaseUrl: string;
  allowedHosts: string[];
}

export function RunConfigForm({ busy, error, duplicateFrom, defaultBaseUrl, allowedHosts }: RunConfigFormProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2, maxWidth: RUN_FORM_MAX_WIDTH }}>
      <TextField
        name="label" label="Run label" size="small" required disabled={busy}
        placeholder="e.g. prod-2026-07-17"
        defaultValue={duplicateFrom ? `${duplicateFrom.label} (copy)` : undefined}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        name="baseUrl" label="Gateway API base URL" size="small" required disabled={busy}
        placeholder={defaultBaseUrl || BASE_URL_PLACEHOLDER}
        defaultValue={duplicateFrom?.baseUrl ?? defaultBaseUrl}
        helperText={allowedHosts.length > 0
          ? `Allowed hosts: ${allowedHosts.join(", ")}`
          : "No hosts allowed — BENCHMARK_ALLOWED_HOSTS is set but empty on the server."}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <Box sx={{ display: "flex", gap: 2 }}>
        <TextField
          name="schemaModel" label="Schema model" size="small" required disabled={busy}
          placeholder={DEFAULT_SCHEMA_MODEL}
          defaultValue={duplicateFrom?.schemaModel ?? DEFAULT_SCHEMA_MODEL}
          sx={{ flex: 1 }}
        />
        <TextField
          name="schemaVersion" label="Schema version" size="small" required disabled={busy}
          placeholder={DEFAULT_SCHEMA_VERSION}
          defaultValue={duplicateFrom?.schemaVersion ?? DEFAULT_SCHEMA_VERSION}
          sx={{ flex: 1 }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
        Fetches <code>{"{baseUrl}"}/datasets/{"{id}"}?schema_model={"{schema model}"}&schema_version={"{schema version}"}</code>
      </Typography>
      <Box sx={{ display: "flex", gap: 2 }}>
        <TextField
          name="start" label="ID range start" type="number" size="small" required disabled={busy}
          defaultValue={duplicateFrom?.idRangeStart ?? DEFAULT_ID_RANGE_START} sx={{ flex: 1 }}
        />
        <TextField
          name="end" label="ID range end" type="number" size="small" required disabled={busy}
          defaultValue={duplicateFrom?.idRangeEnd ?? DEFAULT_ID_RANGE_END} sx={{ flex: 1 }}
        />
      </Box>
      <Box sx={{ display: "flex", gap: 2 }}>
        <TextField
          name="repeat" label="Repeats per ID" type="number" size="small" required disabled={busy}
          defaultValue={duplicateFrom?.repeat ?? DEFAULT_REPEAT} sx={{ flex: 1 }}
        />
        <TextField
          name="concurrency" label="Concurrency" type="number" size="small" required disabled={busy}
          defaultValue={duplicateFrom?.concurrency ?? DEFAULT_CONCURRENCY} sx={{ flex: 1 }}
        />
      </Box>
      <Button
        type="submit"
        startIcon={busy ? <Loading size="small" inline label="" color="inherit" /> : <PlayArrowIcon />}
        disabled={busy}
      >
        Start benchmark
      </Button>
      {error && <Typography variant="body2" color="error">{error}</Typography>}
    </Paper>
  );
}
