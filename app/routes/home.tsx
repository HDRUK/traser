import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import type { Route } from "./+types/home";

// Public landing page — no auth. It appears in the logged-out nav, so requiring
// auth here would silently bounce anonymous visitors to /playground.
export { RouteErrorBoundary as ErrorBoundary } from "~/components/RouteError";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TRASER — Metadata Translation Service" },
    {
      name: "description",
      content:
        "Convert health dataset metadata between HDRUK, GWDM, SchemaOrg and other formats.",
    },
  ];
}

export default function Home() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "primary.main",
        color: "primary.contrastText",
      }}
    >
      <Container maxWidth="md" sx={{ textAlign: "center" }}>
        <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
          TRASER
        </Typography>
        <Typography variant="h5" gutterBottom sx={{ opacity: 0.85 }}>
          Metadata Translation Service
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.7 }}>
          Convert health dataset metadata between HDRUK, GWDM, SchemaOrg and
          other formats.
        </Typography>
      </Container>
    </Box>
  );
}
