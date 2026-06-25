import { Suspense, lazy } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = lazy(() => import("swagger-ui-react"));

export default function Docs() {
  return (
    <Box sx={{ p: 2 }}>
      <Suspense
        fallback={
          <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
            <CircularProgress />
          </Box>
        }
      >
        <SwaggerUI url="/openapi.json" />
      </Suspense>
    </Box>
  );
}
