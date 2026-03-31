import * as Sentry from "@sentry/nextjs";

/**
 * Set Sentry user context so errors are associated with a specific user.
 * Call on auth state changes (login/logout).
 */
export function setSentryUser(user: { id: string; email?: string; orgId?: string; role?: string } | null) {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
    });
    if (user.orgId) Sentry.setTag("org_id", user.orgId);
    if (user.role) Sentry.setTag("role", user.role);
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Capture an exception with optional extra context.
 */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
