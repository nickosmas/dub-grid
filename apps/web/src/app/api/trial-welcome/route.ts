import { NextRequest, NextResponse } from "next/server";
import { validateCsrfOrigin } from "@/lib/csrf";
import {
  forbidIfSandboxCookie,
  requireAuthenticatedUserWithClaims,
} from "@/lib/api-auth";
import { createElement } from "react";
import { render } from "@react-email/components";
import { getServiceClient } from "@/lib/supabase-service";
import { sanitizeHeaderValue, emailBaseUrl } from "@/lib/email";
import { TrialWelcomeEmail } from "@/emails/TrialWelcomeEmail";
import { sendResendEmail } from "@/lib/resend";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

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

  const trialStarted =
    org.subscription_status === "trialing" && Boolean(org.trial_ends_at);
  if (!trialStarted) {
    return NextResponse.json(empty);
  }

  // Lazily send the "trial started" email once. Only mark as sent on success so
  // a transient failure retries on the next load.
  if (!org.trial_welcome_email_sent_at) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";
    if (apiKey && user.email) {
      try {
        await sendResendEmail({
          apiKey,
          from: fromEmail,
          to: user.email,
          subject: sanitizeHeaderValue(
            `Your DubGrid trial for ${org.name} has started`,
          ),
          html: await buildTrialStartedEmail(org.name, org.trial_ends_at),
        });
        await service
          .from("organizations")
          .update({ trial_welcome_email_sent_at: new Date().toISOString() })
          .eq("id", orgId)
          .is("trial_welcome_email_sent_at", null);
      } catch (err) {
        Sentry.captureException(err, {
          extra: { context: "trial-welcome-email" },
        });
        logger.error({ err }, "Failed to send trial-started email");
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
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
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
