import { useMemo, useState } from "react";
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
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import LinearProgress from "@mui/material/LinearProgress";
import Switch from "@mui/material/Switch";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import type { Route } from "./+types/root";
import "./app.css";

// Mirrored from auth.server.ts — kept here as a plain type so the client
// bundle never pulls in the server-only auth module.
interface TRASERUser {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  is_admin: number;
}

const PUBLIC_NAV_LINKS = [
  { to: "/playground", label: "Playground" },
  { to: "/docs", label: "API Docs" },
];

const PROTECTED_NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/schema-graph", label: "Translation Graph" },
  { to: "/schema-view", label: "Schema View" },
];

const ADMIN_NAV_LINKS = [{ to: "/results", label: "Test Results" }];

export async function loader({ request }: Route.LoaderArgs) {
  const { getUser } = await import("./lib/auth.server");
  return { user: getUser(request) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon-light.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/favicon-dark.png" media="(prefers-color-scheme: dark)" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
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

export default function App({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData as { user: TRASERUser | null };
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";
  const [mode, setMode] = useState<"dark" | "light">("light");

  const initials = user
    ? `${user.firstname[0]}${user.lastname[0]}`.toUpperCase()
    : null;

  const navLinks = user
    ? [
        ...PROTECTED_NAV_LINKS,
        ...(user.is_admin === 1 ? ADMIN_NAV_LINKS : []),
        ...PUBLIC_NAV_LINKS,
      ]
    : PUBLIC_NAV_LINKS;

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: "#475DA7" },
          secondary: { main: "#3DB28C" },
          error: { main: "#DC3645" },
          background:
            mode === "dark"
              ? { default: "#1e1e1e", paper: "#2d2d2d" }
              : { default: "#F6F7F8", paper: "#ffffff" },
        },
        typography: {
          fontFamily: '"Source Sans 3", sans-serif',
        },
      }),
    [mode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar
        position="sticky"
        elevation={2}
        sx={{ bgcolor: "#475DA7" }}
      >
        <Toolbar variant="dense" sx={{ gap: 0.5 }}>
          {/* Gateway logo */}
          <Box
            component="img"
            src="/gateway-white-logo.svg"
            alt="Gateway"
            sx={{ height: 22, mr: 1, flexShrink: 0 }}
          />
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, color: "#fff", mr: 2, letterSpacing: "0.04em" }}
          >
            TRASER
          </Typography>

          {/* Nav links */}
          {navLinks.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {({ isActive }) => (
                <Button
                  size="small"
                  sx={{
                    color: isActive ? "#fff" : "rgba(255,255,255,0.72)",
                    bgcolor: isActive ? "rgba(255,255,255,0.18)" : "transparent",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
                    textTransform: "none",
                    fontWeight: isActive ? 700 : 400,
                    borderRadius: 1,
                    px: 1.5,
                    fontSize: "0.875rem",
                  }}
                >
                  {label}
                </Button>
              )}
            </NavLink>
          ))}

          <Box sx={{ flex: 1 }} />

          {/* User initials */}
          {initials && (
            <Tooltip title={`${user!.firstname} ${user!.lastname}`}>
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: "rgba(255,255,255,0.2)",
                  color: "#fff",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  mr: 0.5,
                }}
              >
                {initials}
              </Avatar>
            </Tooltip>
          )}

          {/* Dark / light mode toggle */}
          <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <LightModeIcon
                sx={{ fontSize: 16, color: mode === "light" ? "#fff" : "rgba(255,255,255,0.45)" }}
              />
              <Switch
                size="small"
                checked={mode === "dark"}
                onChange={(_, checked) => setMode(checked ? "dark" : "light")}
                sx={{
                  "& .MuiSwitch-thumb": { bgcolor: "#fff" },
                  "& .MuiSwitch-track": {
                    bgcolor: "rgba(255,255,255,0.35) !important",
                    opacity: "1 !important",
                  },
                }}
              />
              <DarkModeIcon
                sx={{ fontSize: 16, color: mode === "dark" ? "#fff" : "rgba(255,255,255,0.45)" }}
              />
            </Box>
          </Tooltip>
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
    if (error.status === 403) {
      message = "403 Forbidden";
      details = "You must be a Gateway admin to access this page.";
    } else if (error.status === 404) {
      message = "404";
      details = "The requested page could not be found.";
    } else {
      message = "Error";
      details = error.statusText || details;
    }
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
