// Vitest runs server code outside Next.js's RSC bundler, which is the only
// context where the real "server-only" package's client-bundle guard is
// meaningful. This no-op stand-in lets server-side unit tests import
// server-only modules without tripping that guard.
export {};
