import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import type { Theme } from "@mui/material/styles";
import type { DiffEntry } from "~/lib/diff.server";
import { DIFF_VALUE_MAX_WIDTH } from "~/lib/benchmark/constants";
import { formatDiffValue } from "~/lib/benchmark/format";

const monospaceCell = {
  fontFamily: "monospace",
  fontSize: (theme: Theme) => theme.typography.caption.fontSize,
};

const truncatedValueCell = {
  ...monospaceCell,
  maxWidth: DIFF_VALUE_MAX_WIDTH,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export function ComparisonDiffTable({ diffs }: { diffs: DiffEntry[] }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Path</TableCell>
          <TableCell>Before</TableCell>
          <TableCell>After</TableCell>
          <TableCell>Type</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {diffs.map((diff, i) => (
          <TableRow key={i}>
            <TableCell sx={monospaceCell}>{diff.path}</TableCell>
            <TableCell sx={truncatedValueCell}>{formatDiffValue(diff.before)}</TableCell>
            <TableCell sx={truncatedValueCell}>{formatDiffValue(diff.after)}</TableCell>
            <TableCell>{diff.changeType}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
