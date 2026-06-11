import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
} from "react-router";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import LinearProgress from "@mui/material/LinearProgress";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import type { Route } from "./+types/root";
import "./app.css";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#475DA7" },
    background: {
      default: "#1e1e1e",
      paper:   "#2d2d2d",
    },
  },
});

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/results", label: "Test Results" },
  { to: "/schema-graph", label: "Translation Graph" },
  { to: "/schema-view", label: "Schema View" },
  { to: "/playground", label: "Playground" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "background.paper", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "primary.light", mr: 2 }}>
            TRASER
          </Typography>
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {({ isActive }) => (
                <Button
                  size="small"
                  sx={{
                    color: isActive ? "#fff" : "text.secondary",
                    bgcolor: isActive ? "rgba(71,93,167,0.3)" : "transparent",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                    textTransform: "none",
                    fontWeight: isActive ? 600 : 400,
                    borderRadius: 1,
                    px: 1.5,
                  }}
                >
                  {label}
                </Button>
              )}
            </NavLink>
          ))}
        </Toolbar>
        {isNavigating && (
          <LinearProgress
            sx={{ height: 2, position: "absolute", bottom: 0, left: 0, right: 0 }}
          />
        )}
      </AppBar>
      <Box
        component="main"
        sx={{
          transition: "opacity 0.15s ease",
          opacity: isNavigating ? 0.4 : 1,
          pointerEvents: isNavigating ? "none" : "auto",
        }}
      >
        <Outlet />
      </Box>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
