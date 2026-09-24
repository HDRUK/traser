import { Suspense, lazy } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import "swagger-ui-react/swagger-ui.css";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

const SwaggerUI = lazy(() => import("swagger-ui-react"));

export default function Docs() {
  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ px: 1, pt: 1, pb: 2 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          API Documentation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Convert health dataset metadata between HDRUK, GWDM, SchemaOrg and
          other formats.
        </Typography>
      </Box>
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
