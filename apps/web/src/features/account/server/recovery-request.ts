import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { createAnonClient } from "@/lib/api-auth";
import {
  apiLimiter,
  checkRateLimit,
  hashEmail,
  passwordResetLimiter,
  recoverySurgeLimiter,
} from "@/lib/rate-limit";
import { writeSecurityAuditEvent } from "@/lib/auth/security-audit";

const inputSchema = z.object({ email: z.string().trim().email() });

function response(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

function sourceKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function handleRecoveryRequest(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ success: false, error: API_ERRORS.INVALID_BODY }, 400);
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return response({ success: false, error: API_ERRORS.INVALID_INPUT }, 400);
  }

  const targetHash = hashEmail(parsed.data.email);
  const limits = await Promise.all([
    checkRateLimit(apiLimiter, `recovery:source:${sourceKey(request)}`),
    checkRateLimit(passwordResetLimiter, `recovery:target:${targetHash}`),
    checkRateLimit(recoverySurgeLimiter, "recovery:global"),
  ]);

  if (limits.some((limit) => limit.misconfigured)) {
    await writeSecurityAuditEvent({
      event: "security.auth.recovery",
      outcome: "failed",
      reason: "service_unavailable",
      metadata: { targetHash },
    });
    return response({ success: false, error: API_ERRORS.SERVICE_UNAVAILABLE }, 503);
  }

  const denied = limits.filter((limit) => limit.limited);
  if (denied.length > 0) {
    const retryAfter = Math.max(
      1,
      ...denied.map((limit) => (limit.reset ? Math.ceil((limit.reset - Date.now()) / 1000) : 60)),
    );
    await writeSecurityAuditEvent({
      event: "security.auth.recovery",
      outcome: "throttled",
      reason: "rate_limited",
      metadata: { targetHash },
    });
    return response(
      { success: false, error: "Too many requests. Wait a few minutes and try again." },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  const origin = new URL(request.url).origin;
  const { error } = await createAnonClient().auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/reset-password`,
  });

  if (error?.status === 429) {
    await writeSecurityAuditEvent({
      event: "security.auth.recovery",
      outcome: "throttled",
      reason: "rate_limited",
      metadata: { targetHash },
    });
    return response(
      { success: false, error: "Too many requests. Wait a few minutes and try again." },
      429,
    );
  }
  if (error && (error.status ?? 0) >= 500) {
    await writeSecurityAuditEvent({
      event: "security.auth.recovery",
      outcome: "failed",
      reason: "service_unavailable",
      metadata: { targetHash },
    });
    return response({ success: false, error: API_ERRORS.SERVICE_UNAVAILABLE }, 503);
  }

  await writeSecurityAuditEvent({
    event: "security.auth.recovery",
    outcome: "succeeded",
    reason: "accepted",
    metadata: { targetHash },
  });
  return response({ success: true });
}
