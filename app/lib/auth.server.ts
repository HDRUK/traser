import { redirect } from "react-router";
import { jwtDecode } from "jwt-decode";
import { parse as parseCookies } from "cookie";

export interface TRASERUser {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  is_admin: number;
}

interface JwtPayload {
  user?: Partial<TRASERUser>;
}

// NOTE: JWT signatures are intentionally not verified here. TRASER is an
// internal tool expected to sit behind the Gateway reverse proxy, which
// sets the HttpOnly `token` cookie after authenticating the user. We trust
// the cookie at the network boundary. If TRASER is ever exposed directly,
// switch to `jose` jwtVerify with the Gateway's public key.
export function getUser(request: Request): TRASERUser | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const token = parseCookies(cookieHeader)["token"];
  if (!token) return null;

  try {
    const { user } = jwtDecode<JwtPayload>(token);
    if (!user?.firstname || !user?.lastname) return null;
    return {
      id: user.id ?? 0,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email ?? "",
      is_admin: user.is_admin ?? 0,
    };
  } catch {
    return null;
  }
}

export function requireAuth(request: Request): TRASERUser {
  const user = getUser(request);
  if (!user) throw redirect("/playground");
  return user;
}

export function requireAdmin(request: Request): TRASERUser {
  const user = requireAuth(request);
  if (user.is_admin !== 1) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}
