import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import LinkIconButton from "@mui/material/IconButton";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { gatewayDatasetUrl } from "~/lib/results/constants";
import type { FetchFailure } from "~/lib/cache.server";

export function FetchFailuresTab({ failures }: { failures: FetchFailure[] }) {
  if (failures.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography color="text.secondary">
          No fetch failures — every dataset in the Gateway&apos;s list currently fetches OK from its individual endpoint.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {failures.length} dataset{failures.length > 1 ? "s" : ""} appear in the Gateway&apos;s dataset list but failed
        to fetch from their individual <code>/datasets/&#123;id&#125;</code> endpoint. They stay uncached and retry
        automatically the next time you click <strong>Sync New</strong>.
      </Typography>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Gateway ID</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Error</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">HTTP Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Attempts</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>First failed</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last failed</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {failures.map((f) => (
                <TableRow key={f.id} hover>
                  <TableCell>{f.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color={f.title ? "text.primary" : "text.disabled"}
                      sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.title ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="error.main">{f.error}</Typography>
                  </TableCell>
                  <TableCell align="center">{f.status ?? "—"}</TableCell>
                  <TableCell align="center">{f.attempts}</TableCell>
                  <TableCell>{new Date(f.firstFailedAt).toLocaleString()}</TableCell>
                  <TableCell>{new Date(f.lastFailedAt).toLocaleString()}</TableCell>
                  <TableCell align="center">
                    <Tooltip title={`Open dataset ${f.id} on the Health Data Gateway`}>
                      <LinkIconButton component="a" href={gatewayDatasetUrl(f.id)}
                        target="_blank" rel="noopener noreferrer" size="small"
                        aria-label={`Open dataset ${f.id} on the Health Data Gateway`}>
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </LinkIconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
