import { NextResponse } from "next/server";
import { requireCurrentUser, UnauthenticatedError } from "@/lib/auth/current-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";

/**
 * A real, minimal service worker (Master Spec §40) — registered so the
 * manifest's PWA installability criteria are genuinely met, not just
 * declared. Deliberately does not claim offline behavior or caching: it
 * activates immediately and passes every fetch straight through to the
 * network. Real offline/caching behavior is "where appropriate" per §40,
 * not required, and is not implemented here — claiming it without
 * implementing it would overstate what this build does.
 *
 * Gated by the same platform session/tenant checks as manifest.webmanifest
 * (this route lives under the same authenticated Studio area) — added in
 * response to Phase 2 Level 3 review round 1, which found this route had
 * no auth/tenant check at all, contradicting the sibling route's own stated
 * "every other project route" gating claim.
 */
const SERVICE_WORKER_SOURCE = `
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through only — no offline caching is implemented.
  event.respondWith(fetch(event.request));
});
`.trim();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string; projectSlug: string }> },
) {
  const { orgSlug, projectSlug } = await params;

  let user;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    throw error;
  }

  await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  return new NextResponse(SERVICE_WORKER_SOURCE, {
    headers: { "Content-Type": "application/javascript", "Service-Worker-Allowed": "/" },
  });
}
