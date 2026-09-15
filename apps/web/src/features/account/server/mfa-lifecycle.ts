import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  createSensitiveActionStepUpRequired,
  resolveVerifiedTotpFactorPresence,
} from "@dubgrid/authz";
import { mfaLifecycleRequestSchema } from "@dubgrid/contracts";
import { createAnonClient, createTokenScopedClient } from "@/lib/api-auth";
import { verifyAccessToken } from "@/lib/auth/verify-token";
import { apiLimiter, checkRateLimit, loginLimiter } from "@/lib/rate-limit";
import { writeSecurityAuditEvent } from "@/lib/auth/security-audit";

type LifecycleIdentity = {
  accessToken: string;
  user: User;
  claims: { org_id?: unknown };
};
type Gate = (req: NextRequest) => Promise<LifecycleIdentity | { response: NextResponse }>;

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** User-scoped provider mutations, never Auth Admin mutations. Both transports
 * run their existing authentication gates before entering the same lifecycle. */
export function createMfaLifecycleHandler(options: {
  liveAuth: Gate;
  sensitiveAuth: Gate;
  surface: "web" | "mobile";
}) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const parsed = mfaLifecycleRequestSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return reply({ error: "Check your request and try again." }, 400);
      const input = parsed.data;
      const auth = await (input.action === "enroll" || input.action === "remove"
        ? options.sensitiveAuth(req)
        : options.liveAuth(req));
      if ("response" in auth) {
        auth.response.headers.set("Cache-Control", "no-store");
        return auth.response;
      }
      const hasTotp = resolveVerifiedTotpFactorPresence(auth.user.factors);
      if (hasTotp === null) return reply({ error: "We could not verify two-factor status." }, 503);
      const rate = await checkRateLimit(
        input.action === "reauthenticate" ? loginLimiter : apiLimiter,
        `mfa:${input.action}:${auth.user.id}`,
      );
      if (rate.misconfigured) return reply({ error: API_ERRORS.SERVICE_UNAVAILABLE }, 503);
      if (rate.limited) return reply({ error: "Wait a few minutes, then try again." }, 429);

      if (input.action === "reauthenticate") {
        // Never let a client choose another identity or downgrade a TOTP account.
        if (hasTotp) return reply(createSensitiveActionStepUpRequired("totp"), 403);
        if (!auth.user.email) return reply({ error: "Sign in again to continue." }, 401);
        const client = createAnonClient();
        let delivered = false;
        try {
          const { data, error } = await client.auth.signInWithPassword({
            email: auth.user.email,
            password: input.password,
          });
          if (error || !data.session || data.user?.id !== auth.user.id) {
            return reply({ error: "We couldn't confirm your password. Try again." }, 403);
          }
          if (resolveVerifiedTotpFactorPresence(data.user.factors) !== false) {
            return reply(createSensitiveActionStepUpRequired("totp"), 403);
          }
          let session = data.session;
          // Use original signed claims, not a client org or sandbox override.
          if (typeof auth.claims.org_id === "string") {
            const scoped = createTokenScopedClient(session.access_token);
            const { error: switchError } = await scoped.rpc("switch_org", {
              target_org_id: auth.claims.org_id,
            });
            if (switchError) return reply({ error: "We couldn't retain your organization." }, 403);
            const refreshed = await client.auth.refreshSession({
              refresh_token: session.refresh_token,
            });
            if (refreshed.error || !refreshed.data.session) {
              return reply({ error: "We couldn't refresh your session. Try again." }, 503);
            }
            session = refreshed.data.session;
          }
          const verified = await verifyAccessToken(session.access_token);
          if (
            !verified ||
            verified.userId !== auth.user.id ||
            (verified.claims.org_id ?? null) !== (auth.claims.org_id ?? null)
          ) {
            return reply({ error: "We couldn't retain your session. Try again." }, 503);
          }
          delivered = true;
          await writeSecurityAuditEvent({
            event: "security.auth.mfa",
            outcome: "succeeded",
            reason: "reauthenticated",
            actorId: auth.user.id,
            orgId: typeof auth.claims.org_id === "string" ? auth.claims.org_id : null,
            metadata: { surface: options.surface, method: "password" },
          });
          return reply({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        } finally {
          // A failed replacement never logs out the caller's original session.
          if (!delivered) await client.auth.signOut({ scope: "local" }).catch(() => {});
        }
      }

      const client = createTokenScopedClient(auth.accessToken);
      if (input.action === "enroll") {
        if (hasTotp)
          return reply(
            { error: "Two-factor authentication is already enabled. Refresh its status." },
            409,
          );
        const result = await client.auth.mfa.enroll({
          factorType: "totp",
          friendlyName:
            options.surface === "web" ? "DubGrid Authenticator" : "Mobile App Authenticator",
          ...(options.surface === "web" ? { issuer: "DubGrid" } : {}),
        });
        if (result.error || !result.data)
          return reply({ error: "We couldn't start two-factor setup. Try again." }, 502);
        await writeSecurityAuditEvent({
          event: "security.auth.mfa",
          outcome: "succeeded",
          reason: "factor_enrollment_started",
          actorId: auth.user.id,
          orgId: typeof auth.claims.org_id === "string" ? auth.claims.org_id : null,
          metadata: { surface: options.surface, method: "totp" },
        });
        return reply(result.data);
      }

      const factor = auth.user.factors?.find((candidate) => candidate.id === input.factorId);
      if (!factor) return reply({ success: true }); // Retry after an already completed deletion.
      if (factor.factor_type !== "totp")
        return reply({ error: "This factor cannot be changed here." }, 400);
      if (input.action === "cleanup" && factor.status !== "unverified") {
        // Cancel is never permission to remove an enrolled authenticator.
        return reply({ error: "This authenticator is already verified. Refresh its status." }, 409);
      }
      const result = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (result.error)
        return reply(
          { error: "We couldn't remove this authenticator. Check its status before retrying." },
          502,
        );
      await writeSecurityAuditEvent({
        event: "security.auth.mfa",
        outcome: "succeeded",
        reason: "factor_removed",
        actorId: auth.user.id,
        orgId: typeof auth.claims.org_id === "string" ? auth.claims.org_id : null,
        metadata: { surface: options.surface, method: "totp" },
      });
      return reply({ success: true });
    } catch {
      // Do not log provider errors: enrollment replies and credentials are sensitive.
      return reply(
        { error: "We couldn't finish this request. Check its status and try again." },
        503,
      );
    }
  };
}
