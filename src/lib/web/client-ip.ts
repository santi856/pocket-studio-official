import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort client IP for rate-limiting purposes (P3-02 regression
 * repair, D-0053) — not an authoritative network-layer source (a
 * client-supplied X-Forwarded-For header can be spoofed by anyone talking
 * directly to this server), but Next.js's deployment targets (Vercel and
 * equivalent reverse-proxy setups) set this header themselves from the
 * real connecting socket, overwriting anything the client sent. Falls
 * back to a fixed sentinel when absent (local dev, direct-to-origin
 * requests with no proxy) rather than throwing — a missing IP must
 * degrade rate-limiting to the pre-P3-02 email-only behavior for that one
 * request, never block sign-in outright.
 */
export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  const realIp = requestHeaders.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown";
}
