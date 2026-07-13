import { NextResponse } from "next/server";

/**
 * A real, minimal service worker (Master Spec §40) — registered so the
 * manifest's PWA installability criteria are genuinely met, not just
 * declared. Deliberately does not claim offline behavior or caching: it
 * activates immediately and passes every fetch straight through to the
 * network. Real offline/caching behavior is "where appropriate" per §40,
 * not required, and is not implemented here — claiming it without
 * implementing it would overstate what this build does.
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

export function GET() {
  return new NextResponse(SERVICE_WORKER_SOURCE, {
    headers: { "Content-Type": "application/javascript", "Service-Worker-Allowed": "/" },
  });
}
