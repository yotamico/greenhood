import type { NextConfig } from "next";

// NOTE: intentionally NOT wrapped with @sentry/nextjs's withSentryConfig — that build-time
// plugin (source-map upload etc.) throws `withSentryConfig is not a function` against this
// project's Next.js 16, which AGENTS.md already flags as a non-standard build with breaking
// changes from what most tooling expects. Error capture itself doesn't need it: it works via
// the plain Next.js instrumentation.ts/instrumentation-client.ts hooks (see those files) plus
// sentry.server.config.ts/sentry.edge.config.ts, none of which touch next.config at all.
const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
