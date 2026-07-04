import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { validateCsrfOrigin } from "@/lib/csrf";
import { forbidIfSandboxCookie } from "@/lib/api-auth";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { cancelSubscription } from "@/lib/stripe";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const DELETE_ORG_AUDIT_ACTION = "organization.deleted";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  confirmation: z.string().min(1),
});

/**
 * POST /api/organizations/delete
 * Soft-deletes the caller's organization: marks it archived, cancels the
 * Stripe subscription, and writes an audit entry. Reversible by a gridmaster.
 *
 * Authorization: super_admin of the target org only. The gridmaster portal
 * has its own org-management path.
 *
 * Body: { orgId, confirmation: "DELETE <ORG NAME>" }
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }
  const { orgId, confirmation } = parsed.data;

  // Only a super_admin of this org may delete it. Allow even when the org is
  // billing-locked or setup is incomplete, so a stuck org can still be closed.
  const authorized = await requireOrgPermissions(
    req,
    orgId,
    (permissions) => permissions.isSuperAdmin,
    { allowLockedOrganization: true, allowDuringSetup: true },
  );
  if ("response" in authorized) return authorized.response;
  const { actor, serviceClient, orgId: effectiveOrgId } = authorized;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, actor.id);
  if (misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
    );
  }

  // Load the org so we can match the typed confirmation and skip double-deletes.
  const { data: org, error: orgError } = await serviceClient
    .from("organizations")
    .select("id, name, archived_at")
    .eq("id", effectiveOrgId)
    .maybeSingle();

  if (orgError || !org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  if (org.archived_at) {
    return NextResponse.json({ error: "This organization has already been deleted." }, { status: 409 });
  }

  if (confirmation !== `DELETE ${org.name}`) {
    return NextResponse.json(
      { error: `Confirmation text must be exactly: DELETE ${org.name}` },
      { status: 400 },
    );
  }

  // Soft delete: mark archived and cancel billing. The access gates
  // (middleware + JWT hook) treat archived_at the same as suspended_at, so
  // members lose access once their cached/active token clears.
  const { error: archiveError } = await serviceClient
    .from("organizations")
    .update({ archived_at: new Date().toISOString(), subscription_status: "canceled" })
    .eq("id", effectiveOrgId);

  if (archiveError) {
    Sentry.captureException(archiveError, {
      extra: { orgId: effectiveOrgId, context: "org-deletion" },
    });
    logger.error({ error: archiveError, orgId: effectiveOrgId }, "Failed to archive organization");
    return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 });
  }

  // Cancel the Stripe subscription. A Stripe failure must not block the
  // delete: the org is already archived. Log and continue.
  let stripeCanceled = false;
  try {
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("org_id", effectiveOrgId)
      .maybeSingle();
    if (sub?.stripe_subscription_id) {
      await cancelSubscription(sub.stripe_subscription_id);
      await serviceClient
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("org_id", effectiveOrgId);
      stripeCanceled = true;
    }
  } catch (stripeError) {
    Sentry.captureException(stripeError, {
      extra: { orgId: effectiveOrgId, context: "org-deletion-stripe" },
    });
    logger.error({ error: stripeError, orgId: effectiveOrgId }, "Failed to cancel Stripe subscription on org deletion");
  }

  try {
    await serviceClient.from("audit_log").insert({
      org_id: effectiveOrgId,
      actor_id: actor.id,
      actor_email: actor.email,
      action: DELETE_ORG_AUDIT_ACTION,
      resource_type: "organization",
      resource_id: effectiveOrgId,
      details: { name: org.name, stripeCanceled },
    });
  } catch (auditError) {
    logger.error({ error: auditError, orgId: effectiveOrgId }, "Failed to write org deletion audit log");
  }

  logger.info({ orgId: effectiveOrgId, actorId: actor.id }, "Organization deleted");

  return NextResponse.json({ success: true });
}
