import type { NextConfig } from "next";
import path from "node:path";

// Baseline security headers (staging-readiness sprint) — this repo had
// none configured before (verified: no middleware.ts anywhere, and this
// file previously had no headers() function at all). Intentionally
// conservative: no CSP is set here, since generated-app screens render
// customer-influenced content through the Structured Renderer and a
// correct CSP for that surface needs its own dedicated review, not a
// value guessed in passing — omitting it is more honest than shipping
// one untested. The headers below are safe, standard, and apply
// unconditionally without narrowing any existing behavior.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
