import { isRouteErrorResponse, useRouteError } from "react-router";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";

/**
 * Shared per-route error boundary. Re-export it as `ErrorBoundary` from a route
 * module so a loader/action/render error renders *inside* the root layout
 * (AppBar + nav survive) instead of bubbling to the root ErrorBoundary, which
 * replaces the whole app chrome. Uses `useRouteError()` so it stays route-agnostic.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  let title = "Something went wrong";
  let detail = "An unexpected error occurred while loading this page.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 403) {
      title = "403 — Forbidden";
      detail = "You must be a Gateway admin to access this page.";
    } else if (error.status === 404) {
      title = "404 — Not found";
      detail = "The requested resource could not be found.";
    } else {
      title = `Error ${error.status}`;
      detail = error.statusText || detail;
    }
  } else if (error instanceof Error) {
    detail = error.message;
    if (import.meta.env.DEV) stack = error.stack;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error" variant="outlined">
        <AlertTitle>{title}</AlertTitle>
        {detail}
        {stack && (
          <Box
            component="pre"
            sx={{ mt: 1, fontSize: "0.72rem", overflow: "auto", whiteSpace: "pre-wrap" }}
          >
            {stack}
          </Box>
        )}
      </Alert>
    </Box>
  );
}
