import * as Sentry from "@sentry/nextjs";

// Fully inert until NEXT_PUBLIC_SENTRY_DSN is set (no Sentry project exists yet) — Sentry.init
// with an empty dsn is a documented no-op, so this ships safely ahead of that decision.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
