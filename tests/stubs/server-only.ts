// Vitest runs outside Next.js's bundler, which is what actually enforces
// the "server-only" package's client/server boundary check. Tests alias
// the real package to this no-op so server-only modules stay importable
// here — the safety check itself still applies in the real Next.js build.
export {};
