import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isPasswordAcceptable } from "@dubgrid/domain";
import { API_ERRORS } from "@dubgrid/client-errors";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import { findAuthUserByEmail } from "@/lib/supabase-admin-users";
import { apiLimiter, emailTargetLimiter, checkRateLimit, hashEmail } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

/**
 * Creates the auth account for an invited user, already email-confirmed.
 *
 * An invitee reached this app by clicking a tokenized link that was mailed to
 * their address, so the address is already proven. Putting them through
 * `supabase.auth.signUp()` instead made Supabase mail them a second,
 * unnecessary "Confirm your email" message and hand back a user with no
 * session — the invite could not be accepted until they went and clicked that
 * link, which is not what the invite flow promises.
 *
 * Unauthenticated by design: the invitation token is the credential. It is
 * validated here against a live invitation, and the requested email must be the
 * one that invitation was addressed to.
 */

const bodySchema = z.object({
  token: z.string().trim().uuid(),
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

const INVITE_INVALID = "This invitation is no longer valid. Ask your administrator for a new one.";
const EMAIL_MISMATCH = "This invitation was sent to a different email address.";
const WEAK_PASSWORD = "Choose a stronger password.";

/** GoTrue's duplicate-address signal, across the shapes it has used. */
function isEmailExistsError(error: { code?: string; status?: number; message?: string }): boolean {
  if (error.code === "email_exists" || error.code === "user_already_exists") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("already been registered") || message.includes("already registered");
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Rate limit by IP ────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const perIp = await checkRateLimit(apiLimiter, `invite-register:${ip}`);
  if (perIp.misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (perIp.limited) {
    const retryAfter = perIp.reset ? Math.ceil((perIp.reset - Date.now()) / 1000) : 60;
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── Input validation ────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }
  const { token, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  // ── Per-target-email limit ──────────────────────────────────────────
  // The IP limit above doesn't stop a distributed run at one address.
  const perEmail = await checkRateLimit(emailTargetLimiter, `invite-register:${hashEmail(email)}`);
  if (perEmail.misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (perEmail.limited) {
    const retryAfter = perEmail.reset ? Math.ceil((perEmail.reset - Date.now()) / 1000) : 60;
    return NextResponse.json(
      { error: "Too many attempts for this address. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // Same bar the form enforces, restated server-side — the form is not a gate.
  if (!isPasswordAcceptable(password)) {
    return NextResponse.json({ error: WEAK_PASSWORD }, { status: 400 });
  }

  try {
    const service = getServiceClient();

    // ── The token is the credential: it must be a live invitation ──────
    const { data: invitation, error: lookupError } = await service
      .from("invitations")
      .select("email, first_name, last_name")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    if (lookupError) throw lookupError;

    // Unknown / expired / accepted / revoked all read the same, so a caller
    // can't tell a dead token from one that never existed.
    if (!invitation) {
      return NextResponse.json({ error: INVITE_INVALID }, { status: 404 });
    }

    const invitedEmail = String(invitation.email ?? "")
      .trim()
      .toLowerCase();
    if (invitedEmail !== email) {
      return NextResponse.json({ error: EMAIL_MISMATCH }, { status: 400 });
    }

    // Names ride along so `handle_new_user` can seed the profile; the invite
    // carries them for app-only invitations.
    const firstName = typeof invitation.first_name === "string" ? invitation.first_name : null;
    const lastName = typeof invitation.last_name === "string" ? invitation.last_name : null;

    const { error: createError } = await service.auth.admin.createUser({
      email: invitedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
      },
    });

    if (!createError) {
      return NextResponse.json({ status: "created" });
    }
    if (!isEmailExistsError(createError)) throw createError;

    // ── An account already holds this address ──────────────────────────
    const existing = await findAuthUserByEmail(invitedEmail);

    // A confirmed account is a real one — possibly this person's account in
    // another organization. Never touch its password; they sign in with the
    // one they already have.
    if (!existing || existing.emailConfirmed) {
      return NextResponse.json({ status: "existing" });
    }

    // Unconfirmed, and belongs to no organization: an abandoned signup, which
    // is exactly what the old confirm-your-email flow stranded people in.
    // The invitation proves this inbox, so finish what it started rather than
    // leaving the address permanently unusable.
    const { count, error: membershipError } = await service
      .from("organization_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", existing.id);
    if (membershipError) throw membershipError;
    if (count && count > 0) {
      return NextResponse.json({ status: "existing" });
    }

    const { error: updateError } = await service.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      password,
    });
    if (updateError) throw updateError;

    return NextResponse.json({ status: "created" });
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "invitation-register" } });
    logger.error({ error, path: "/api/invitations/register" }, "Invitation registration failed");
    return NextResponse.json({ error: "Failed to create your account" }, { status: 500 });
  }
}
