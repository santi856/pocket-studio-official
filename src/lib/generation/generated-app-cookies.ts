import "server-only";
import { cookies } from "next/headers";

const COOKIE_PREFIX = "pocket_studio_generated_app_session";

/**
 * One cookie per project, not one shared cookie — a browser may
 * legitimately have live sessions with several different generated apps
 * (different projects) at once, the same way it can be signed into
 * several unrelated real websites at once. Keying the cookie name by
 * projectId keeps those sessions independent without relying on cookie
 * `path` scoping (which the server would still have to re-verify anyway —
 * see requireGeneratedAppSessionForProject's own projectId check).
 */
function cookieName(projectId: string): string {
  return `${COOKIE_PREFIX}_${projectId}`;
}

/**
 * Only callable from a Server Action or Route Handler — same restriction
 * as src/lib/auth/cookies.ts's setSessionCookie, for the same reason.
 */
export async function setGeneratedAppSessionCookie(
  projectId: string,
  token: string,
  expiresAt: Date,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(cookieName(projectId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearGeneratedAppSessionCookie(projectId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName(projectId));
}

export async function getGeneratedAppSessionTokenFromCookies(
  projectId: string,
): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(cookieName(projectId))?.value ?? null;
}
