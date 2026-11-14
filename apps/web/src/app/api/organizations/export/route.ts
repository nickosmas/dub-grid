import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { fetchHiddenPeople, requireOrgPermissions } from "@/app/api/shared/permissions";
import { requireAuthenticatedUser, requireSensitiveActionAuth } from "@/lib/api-auth";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import logger from "@/lib/logger";
import {
  archiveFilename,
  buildOrganizationArchive,
} from "@/features/organization/server/archive-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({ orgId: z.guid() });

/**
 * The organization's data as a ZIP of CSVs, for its Super Admin before they
 * delete it (F-203). Fresh proof first: it carries every person's contact
 * details and the whole schedule history.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: API_ERRORS.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(reset)) } },
    );
  }

  const parsed = querySchema.safeParse({ orgId: new URL(req.url).searchParams.get("orgId") });
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
  }

  const orgAuth = await requireOrgPermissions(
    req,
    parsed.data.orgId,
    (permissions) => permissions.isSuperAdmin,
    { actor: user },
  );
  if ("response" in orgAuth) return orgAuth.response;

  const assurance = await requireSensitiveActionAuth(req);
  if ("response" in assurance) return assurance.response;

  const { serviceClient, orgId } = orgAuth;
  try {
    const [hiddenUserIds, { data: org }] = await Promise.all([
      fetchHiddenPeople(orgAuth),
      serviceClient.from("organizations").select("slug").eq("id", orgId).maybeSingle(),
    ]);
    const archive = await buildOrganizationArchive(serviceClient, orgId, hiddenUserIds);

    await serviceClient.from("audit_log").insert({
      org_id: orgId,
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: "data.exported",
      resource_type: "data_export",
      resource_id: "organization_archive",
      details: { type: "organization_archive" },
    });

    return new Response(archive, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${archiveFilename(org?.slug as string | null)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error({ error, orgId }, "Organization export failed");
    return NextResponse.json(
      { error: "We couldn't prepare your organization's data. Try again." },
      { status: 500 },
    );
  }
}
