/**
 * Shared response-shaping helpers for the JSON API.
 *
 * - fieldError / invalidParams / invalidRequest build the
 *   `{ message, errors: [...] }` 400 body used for query/body validation
 *   failures.
 * - shapeError / errorResponse gate what an error exposes: client errors keep
 *   their message/details; unexpected server errors are genericised so internal
 *   detail can't leak.
 */

// ─── field errors ──────────────────────────────────────────────────────────
//
// `errors[]` items match the shape Gateway-web reads (`errors[0].msg`, `.path`).

export interface FieldError {
  type: "field";
  value?: unknown;
  msg: string;
  path: string;
  location: "query" | "body" | "params" | "headers";
}

export function fieldError(
  msg: string,
  path: string,
  location: FieldError["location"] = "query",
  value?: unknown
): FieldError {
  return {
    type: "field",
    ...(value !== undefined ? { value } : {}),
    msg,
    path,
    location,
  };
}

/** 400 with `{ message, errors }` for invalid query parameters. */
export function invalidParams(message: string, errors: FieldError[]): Response {
  return Response.json({ message, errors }, { status: 400 });
}

/** 400 with `{ errors }` and no top-level message (used by `/find`). */
export function invalidRequest(errors: FieldError[]): Response {
  return Response.json({ errors }, { status: 400 });
}

// ─── internal-error shaping ────────────────────────────────────────────────

interface InternalError {
  status?: number;
  message?: string;
  details?: unknown;
  expose?: boolean;
}

/**
 * Map an internal error object (as returned by translation.server.ts helpers:
 * `{ status, message, details }`) to a client-safe `{ message, details }` body +
 * HTTP status. The internal `status` field is never echoed into the body.
 *
 * Client errors (4xx) and errors explicitly marked `expose: true` keep their
 * message/details. Unexpected server errors (5xx) are genericised so stack /
 * internal detail can't leak to the client.
 */
export function shapeError(
  err: unknown,
  fallbackStatus = 500
): { body: { message: string; details?: unknown }; status: number } {
  const e = (err ?? {}) as InternalError;
  const status = typeof e.status === "number" ? e.status : fallbackStatus;
  const expose = e.expose === true || (status >= 400 && status < 500);

  if (!expose) {
    return { body: { message: "Internal server error" }, status };
  }
  return {
    body: {
      message: e.message ?? "Error",
      ...(e.details !== undefined ? { details: e.details } : {}),
    },
    status,
  };
}

/** Convenience: shapeError() → Response. */
export function errorResponse(err: unknown, fallbackStatus = 500): Response {
  const { body, status } = shapeError(err, fallbackStatus);
  return Response.json(body, { status });
}

/**
 * Forward a *known/curated* internal error (e.g. the `{status,message,details}`
 * objects returned by translation.server.ts) to the client as `{message,details}`
 * with its status — exposed regardless of 4xx/5xx, because the message is
 * author-controlled and safe. Use this for expected failure branches; use
 * errorResponse()/shapeError() for the catch-all where the error is unexpected
 * and might carry internal detail.
 */
export function forwardKnownError(e: {
  status?: number;
  message?: string;
  details?: unknown;
}): Response {
  return Response.json(
    { message: e.message ?? "Error", ...(e.details !== undefined ? { details: e.details } : {}) },
    { status: e.status ?? 500 }
  );
}
