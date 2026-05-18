import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { loadOrganizationBillingSummary } from "@/features/billing/server";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  orgId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    orgId: req.nextUrl.searchParams.get("orgId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const auth = await requireOrgPermissions(
    req,
    parsed.data.orgId,
    (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
    // ignoreSandbox: billing is read-only and intentionally surfaces
    // the source workspace's real Stripe state even when the caller is
    // in sandbox mode. Without this, the sandbox-redirect would route
    // the check to the (subscription_status='active') sandbox clone and
    // hide all the real billing details.
    { allowLockedWorkspace: true, ignoreSandbox: true },
  );
  if ("response" in auth) {
    return auth.response;
  }

  try {
    return NextResponse.json(
      await loadOrganizationBillingSummary(auth.serviceClient, parsed.data.orgId, {
        canManageBilling: auth.permissions.isGridmaster || auth.permissions.isSuperAdmin,
        actor: auth.actor,
      }),
    );
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "billing-summary" } });
    logger.error({ error, orgId: parsed.data.orgId }, "Failed to load billing summary");
    return NextResponse.json(
      { error: "Failed to load billing" },
      { status: 500 },
    );
  }
}
