import { forwardRef } from "react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
  type LinkProps,
} from "react-router";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { ThemeProvider } from "@mui/material/styles";
import { Header } from "@hdruk/ui";
import { createHdrukTheme } from "@hdruk/ui/theme";

import type { Route } from "./+types/root";
import type { TRASERUser } from "./lib/auth.server";

const PUBLIC_NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "API Docs", href: "/docs" },
  { label: "Playground", href: "/playground" },
];

const PROTECTED_NAV_LINKS: { label: string; href: string }[] = [
  { label: "Translation Graph", href: "/schema-graph" },
];

// Adapts @hdruk/ui's `href`-based link contract to React Router's `to`.
const HeaderLink = forwardRef<
  HTMLAnchorElement,
  Omit<LinkProps, "to"> & { href?: string }
>(({ href, ...props }, ref) => <Link ref={ref} to={href ?? "#"} {...props} />);
HeaderLink.displayName = "HeaderLink";

const theme = createHdrukTheme();
// ── Global request middleware ──
// Runs for every route (UI pages and JSON API resource routes). Sets baseline
// security headers and enforces a request body-size limit.

const MAX_BODY_MB = parseInt(process.env.MAX_BODY_MB ?? "10", 10);

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  "X-DNS-Prefetch-Control": "off",
};

export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }, next) => {
    // Reject over-limit bodies up front (declared Content-Length).
    if (MAX_BODY_MB > 0) {
      const len = request.headers.get("content-length");
      if (len && Number(len) > MAX_BODY_MB * 1024 * 1024) {
        return Response.json(
          { message: `Request body too large (limit ${MAX_BODY_MB}mb)` },
          { status: 413 }
        );
      }
    }

    const response = await next();
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(key)) response.headers.set(key, value);
    }
    return response;
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { getUser } = await import("./lib/auth.server");
  // Kick off the once-per-server background job. It is an idempotent
  // lazy-singleton, so calling it on every request is free after the first.
  const { startSchemaReloader } = await import("./lib/schema.server");
  startSchemaReloader();
  return { user: await getUser(request) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="icon"
          href="/favicon-light.png"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          href="/favicon-dark.png"
          media="(prefers-color-scheme: dark)"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
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

  const navLinks = user ? [...PUBLIC_NAV_LINKS, ...PROTECTED_NAV_LINKS] : PUBLIC_NAV_LINKS;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ position: "sticky", top: 0, zIndex: (t) => t.zIndex.appBar }}>
        <Header
          logoImage={
            <Box
              component="img"
              src="/gateway-white-logo.svg"
              alt="Gateway"
              sx={{ height: 22, display: "block" }}
            />
          }
          logoHref="/"
          brandingLogoImage={
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                color: "primary.contrastText",
                letterSpacing: "0.04em",
              }}
            >
              TRASER
            </Typography>
          }
          navItems={navLinks}
          linkComponent={HeaderLink}
          isLoggedIn={!!user}
          accountLoading={false}
          accountName={user ? { first: user.firstname, last: user.lastname } : undefined}
        />

        {isNavigating && (
          <LinearProgress
            sx={{
              height: 2,
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
            }}
          />
        )}
      </Box>

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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container component="main" maxWidth="md" sx={{ py: 6 }}>
        <Alert severity="error" variant="outlined">
          <AlertTitle>{message}</AlertTitle>
          {details}
          {stack && (
            <Box
              component="pre"
              sx={{
                mt: 1,
                fontSize: "0.72rem",
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {stack}
            </Box>
          )}
        </Alert>
      </Container>
    </ThemeProvider>
  );
}
