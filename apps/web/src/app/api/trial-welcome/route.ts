import { NextRequest, NextResponse } from "next/server";
import { validateCsrfOrigin } from "@/lib/csrf";
import { forbidIfSandboxCookie, requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { createElement } from "react";
import { render } from "@react-email/components";
import { getServiceClient } from "@/lib/supabase-service";
import { sanitizeHeaderValue, emailBaseUrl } from "@/lib/email";
import { TrialWelcomeEmail } from "@/emails/TrialWelcomeEmail";
import { sendResendEmail } from "@/lib/resend";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

type TrialWelcomeState = {
  shouldShowWelcome: boolean;
  trialEndsAt: string | null;
};

function formatTrialEndDate(value: string | null): string {
  if (!value) return "soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildTrialStartedEmail(orgName: string, trialEndsAt: string | null): Promise<string> {
  return render(
    createElement(TrialWelcomeEmail, {
      orgName,
      trialEndDate: formatTrialEndDate(trialEndsAt),
      logoUrl: emailBaseUrl(),
    }),
  );
}

// GET: returns whether the one-time trial welcome modal should show for this
// super_admin, and lazily sends the "trial started" email once (idempotent).
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;
  const { user, claims } = auth;

  const empty: TrialWelcomeState = { shouldShowWelcome: false, trialEndsAt: null };

  // Only org super admins get the trial welcome. Gridmasters have no org trial.
  if (claims.org_role !== "super_admin" || !claims.org_id) {
    return NextResponse.json(empty);
  }

  const orgId = String(claims.org_id);
  const service = getServiceClient();

  const { data: org, error } = await service
    .from("organizations")
    .select(
      "name, subscription_status, trial_ends_at, trial_welcome_email_sent_at, trial_welcome_seen_at",
    )
    .eq("id", orgId)
    .maybeSingle();

  if (error || !org) {
    if (error) {
      Sentry.captureException(error, { extra: { context: "trial-welcome-get" } });
    }
    return NextResponse.json(empty);
  }

  const trialStarted = org.subscription_status === "trialing" && Boolean(org.trial_ends_at);
  if (!trialStarted) {
    return NextResponse.json(empty);
  }

  // Lazily send the "trial started" email exactly once. This GET is polled and
  // refetched by the welcome modal, so a plain check-send-mark would let two
  // concurrent requests both read sent_at=null and each send an email. Instead
  // we ATOMICALLY claim the send first: flip trial_welcome_email_sent_at from
  // NULL in a single UPDATE and only the request that wins the row (returns it)
  // sends. On failure we roll the claim back so a later load retries.
  if (!org.trial_welcome_email_sent_at) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";
    if (apiKey && user.email) {
      const claimedAt = new Date().toISOString();
      const { data: claimed, error: claimError } = await service
        .from("organizations")
        .update({ trial_welcome_email_sent_at: claimedAt })
        .eq("id", orgId)
        .is("trial_welcome_email_sent_at", null)
        .select("id")
        .maybeSingle();

      if (!claimError && claimed) {
        // We won the claim — send exactly once.
        try {
          await sendResendEmail({
            apiKey,
            from: fromEmail,
            to: user.email,
            subject: sanitizeHeaderValue(`Your DubGrid trial for ${org.name} has started`),
            html: await buildTrialStartedEmail(org.name, org.trial_ends_at),
          });
        } catch (err) {
          // Roll the claim back (only if it's still ours) so a retry can send.
          await service
            .from("organizations")
            .update({ trial_welcome_email_sent_at: null })
            .eq("id", orgId)
            .eq("trial_welcome_email_sent_at", claimedAt);
          Sentry.captureException(err, {
            extra: { context: "trial-welcome-email" },
          });
          logger.error({ err }, "Failed to send trial-started email");
        }
      }
    }
  }

  const state: TrialWelcomeState = {
    shouldShowWelcome: !org.trial_welcome_seen_at,
    trialEndsAt: org.trial_ends_at,
  };
  return NextResponse.json(state);
}

// POST: marks the one-time trial welcome modal as seen for this organization.
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;
  const { claims } = auth;

  if (claims.org_role !== "super_admin" || !claims.org_id) {
    return NextResponse.json(
      { success: false, error: API_ERRORS.SUPER_ADMIN_ONLY },
      { status: 403 },
    );
  }

  const service = getServiceClient();
  const { error } = await service
    .from("organizations")
    .update({ trial_welcome_seen_at: new Date().toISOString() })
    .eq("id", String(claims.org_id))
    .is("trial_welcome_seen_at", null);

  if (error) {
    Sentry.captureException(error, { extra: { context: "trial-welcome-dismiss" } });
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
