import { NextRequest, NextResponse } from "next/server";
import { Timer, withTiming } from "@/lib/server-timing";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { loadOrganizationBillingSummary } from "@/features/billing/server";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  orgId: z.string().uuid(),
});

async function handleGET(req: NextRequest, timer: Timer) {
  const parsed = querySchema.safeParse({
    orgId: req.nextUrl.searchParams.get("orgId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const auth = await timer.time("auth", () =>
    requireOrgPermissions(
      req,
      parsed.data.orgId,
      (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
      // ignoreSandbox: billing is read-only and intentionally surfaces
      // the source organization's real Stripe state even when the caller is
      // in sandbox mode. Without this, the sandbox-redirect would route
      // the check to the (subscription_status='active') sandbox clone and
      // hide all the real billing details.
      { allowLockedOrganization: true, ignoreSandbox: true },
    ),
  );
  if ("response" in auth) {
    return auth.response;
  }

  try {
    return NextResponse.json(
      await loadOrganizationBillingSummary(auth.serviceClient, auth.orgId, {
        canManageBilling: auth.permissions.isGridmaster || auth.permissions.isSuperAdmin,
        actor: auth.actor,
      }),
    );
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "billing-summary" } });
    logger.error({ error, orgId: parsed.data.orgId }, "Failed to load billing summary");
    return NextResponse.json(
      { error: "We couldn't load your billing details. Refresh and try again." },
      { status: 500 },
    );
  }
}

export const GET = withTiming(handleGET);
