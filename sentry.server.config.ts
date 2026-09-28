import * as Sentry from "@sentry/nextjs";

// Fully inert until SENTRY_DSN is set — see instrumentation-client.ts.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
