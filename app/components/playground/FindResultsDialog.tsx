import { Fragment } from "react";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { Button, IconButton } from "@hdruk/ui";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FindInPageIcon from "@mui/icons-material/FindInPage";

import type { SchemaRef } from "../../stores/playgroundStore";
import type { FindMatch } from "../../lib/playground/types";

export function FindResultsDialog({
  findResults, findSource, findError, expandedRows, setExpandedRows, inputSchema, onPickInputSchema, onClose,
}: {
  findResults: FindMatch[] | null;
  findSource: "input" | "result" | null;
  findError: string | null;
  expandedRows: Set<string>;
  setExpandedRows: (updater: (prev: Set<string>) => Set<string>) => void;
  inputSchema: SchemaRef | null;
  onPickInputSchema: (name: string, version: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={findResults !== null} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1, py: 1.5 }}>
        <FindInPageIcon fontSize="small" sx={{ color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            Schema match results
            {findSource && (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
                — {findSource === "input" ? "JSON input" : "translation result"}
              </Typography>
            )}
          </Typography>
          {findResults && (
            <Typography variant="caption" color="text.secondary">
              {findResults.filter(r => r.matches).length} of {findResults.length} matched
              {findSource === "input" && " — click \"Use this\" to set the schema"}
            </Typography>
          )}
        </Box>
        <IconButton size="small" aria-label="Close find results" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {findError && (
          <Box sx={{ p: 1.5, color: "error.main", fontFamily: "monospace", fontSize: "0.78rem" }}>{findError}</Box>
        )}

        {findResults && findResults.length > 0 && (
          <>
            <Table size="small" sx={{
              "& th": { fontWeight: 700, bgcolor: "background.paper", fontSize: "0.72rem" },
              "& td, & th": { py: 0.5, px: 1.25 },
            }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 32, px: "6px !important" }}></TableCell>
                  <TableCell>Schema</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell align="right">Status</TableCell>
                  {findSource === "input" && <TableCell sx={{ width: 86 }}></TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {findResults.map((r) => {
                  const rowKey = `${r.name}:${r.version}`;
                  const hasErrors = !r.matches && (r.errors?.length ?? 0) > 0;
                  const isExpanded = expandedRows.has(rowKey);
                  const colSpan = findSource === "input" ? 5 : 4;
                  return (
                    <Fragment key={rowKey}>
                      <TableRow hover>
                        <TableCell sx={{ px: "6px !important" }}>
                          {r.matches
                            ? <CheckCircleIcon sx={{ color: "success.main", fontSize: 16, display: "block" }} />
                            : <CancelIcon sx={{ color: "error.main", fontSize: 16, display: "block" }} />}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.8rem" }}>{r.name}</TableCell>
                        <TableCell sx={{ color: "text.secondary", fontSize: "0.8rem" }}>{r.version}</TableCell>
                        <TableCell align="right">
                          {r.matches ? (
                            <Typography variant="caption" color="success.main">matches</Typography>
                          ) : hasErrors ? (
                            <Button
                              size="small"
                              endIcon={<ExpandMoreIcon sx={{ fontSize: "12px !important", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />}
                              onClick={() => setExpandedRows(prev => {
                                const next = new Set(prev);
                                if (next.has(rowKey)) next.delete(rowKey);
                                else next.add(rowKey);
                                return next;
                              })}
                              sx={{ py: 0, px: 0.5, fontSize: "0.68rem", color: "error.main", minWidth: 0 }}
                            >
                              {r.errors!.length} error{r.errors!.length === 1 ? "" : "s"}
                            </Button>
                          ) : (
                            <Typography variant="caption" color="text.secondary">0 errors</Typography>
                          )}
                        </TableCell>
                        {findSource === "input" && (
                          <TableCell sx={{ textAlign: "right" }}>
                            {r.matches && (
                              <Button size="small" variant={inputSchema?.name === r.name && inputSchema?.version === r.version ? "contained" : "outlined"}
                                onClick={() => onPickInputSchema(r.name, r.version)}
                                sx={{ py: 0, px: 1, fontSize: "0.68rem", minWidth: 0 }}>
                                {inputSchema?.name === r.name && inputSchema?.version === r.version ? "✓ Set" : "Use"}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                      {hasErrors && (
                        <TableRow>
                          <TableCell colSpan={colSpan} sx={{ p: 0, border: isExpanded ? undefined : 0 }}>
                            <Collapse in={isExpanded} unmountOnExit>
                              <Box component="pre" sx={{ m: 0, px: 2, py: 1.25, bgcolor: (theme) => alpha(theme.palette.error.main, 0.06), borderTop: (theme) => `1px solid ${alpha(theme.palette.error.main, 0.2)}`, fontFamily: "monospace", fontSize: "0.72rem", color: "error.light", lineHeight: 1.6, overflow: "auto", maxHeight: 200 }}>
                                {(r.errors ?? []).map((e, i) =>
                                  `${i + 1}. ${e.instancePath || "(root)"}: ${e.message ?? "error"}${e.params ? ` ${JSON.stringify(e.params)}` : ""}`
                                ).join("\n")}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}

        {findResults && findResults.length === 0 && !findError && (
          <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>No schemas tested.</Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
