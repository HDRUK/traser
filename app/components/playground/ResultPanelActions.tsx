import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Button, Loading } from "@hdruk/ui";
import FindInPageIcon from "@mui/icons-material/FindInPage";

import type { SchemaRef } from "../../stores/playgroundStore";

export function ResultPanelActions({
  mappingMode, customOutputSchema, setCustomOutputSchema, setValidateOutputOn,
  allSchemaRefs, outputSchema, validateOutputOn, result, finding, onFindResult,
}: {
  mappingMode: "known" | "custom";
  customOutputSchema: SchemaRef | null;
  setCustomOutputSchema: (v: SchemaRef | null) => void;
  setValidateOutputOn: (v: boolean) => void;
  allSchemaRefs: Array<{ key: string; name: string; version: string }>;
  outputSchema: SchemaRef | null;
  validateOutputOn: boolean;
  result: string;
  finding: "input" | "result" | null;
  onFindResult: () => void;
}) {
  return (
    <>
      {mappingMode === "custom" && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel sx={{ fontSize: "0.8rem" }}>Validate against</InputLabel>
          <Select
            label="Validate against"
            value={customOutputSchema ? `${customOutputSchema.name}:${customOutputSchema.version}` : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) { setCustomOutputSchema(null); setValidateOutputOn(false); }
              else {
                const [name, ...rest] = v.split(":");
                setCustomOutputSchema({ name, version: rest.join(":") });
                setValidateOutputOn(true);
              }
            }}
            sx={{ fontSize: "0.8rem", height: 24 }}
          >
            <MenuItem value=""><em>None</em></MenuItem>
            {allSchemaRefs.map((s) => (
              <MenuItem key={s.key} value={s.key} sx={{ fontSize: "0.8rem" }}>
                {s.name} {s.version}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      {outputSchema && (
        <Tooltip title={validateOutputOn ? "Output validation enabled" : "Output validation disabled"}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.75rem", mr: 0.5 }}>Validate</Typography>
            <Switch size="small" checked={validateOutputOn} onChange={(_, c) => setValidateOutputOn(c)} />
          </Box>
        </Tooltip>
      )}
      {result && (
        <Button variant="text" size="small" startIcon={finding === "result" ? <Loading size="small" label="" /> : <FindInPageIcon sx={{ fontSize: 14 }} />}
          onClick={onFindResult} disabled={finding === "result"}
          sx={{ py: 0, fontSize: "0.8rem" }}>
          {finding === "result" ? "Finding…" : "Find Schemas"}
        </Button>
      )}
    </>
  );
}
