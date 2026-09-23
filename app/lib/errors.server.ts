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

export function invalidParams(message: string, errors: FieldError[]): Response {
  return Response.json({ message, errors }, { status: 400 });
}

export function invalidRequest(errors: FieldError[]): Response {
  return Response.json({ errors }, { status: 400 });
}

interface InternalError {
  status?: number;
  message?: string;
  details?: unknown;
  expose?: boolean;
}

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

export function errorResponse(err: unknown, fallbackStatus = 500): Response {
  const { body, status } = shapeError(err, fallbackStatus);
  return Response.json(body, { status });
}

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
