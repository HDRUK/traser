import { redirect } from "react-router";
import { jwtVerify } from "jose";
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

export async function getUser(request: Request): Promise<TRASERUser | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const token = parseCookies(cookieHeader)["token"];
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify<JwtPayload>(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    const user = payload.user;
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

export async function requireAuth(request: Request): Promise<TRASERUser> {
  const user = await getUser(request);
  if (!user) throw redirect("/playground");
  return user;
}

export async function requireAdmin(request: Request): Promise<TRASERUser> {
  const user = await requireAuth(request);
  if (user.is_admin !== 1) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}
