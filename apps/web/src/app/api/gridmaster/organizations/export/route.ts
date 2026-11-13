import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { fetchHiddenInternalUserIds } from "@dubgrid/data-access";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import {
  archiveFilename,
  buildOrganizationArchive,
} from "@/features/organization/server/archive-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({ orgId: z.string().uuid() });

/**
 * The same ZIP the Super Admin can download, produced by DubGrid support for
 * an organization on request, including one deleted within the last 90 days
 * (F-203). Internal QA accounts stay out, as the customer never saw them.
 */
export async function GET(req: NextRequest) {
  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;

  const parsed = querySchema.safeParse({ orgId: new URL(req.url).searchParams.get("orgId") });
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
  }

  const assurance = await requireSensitiveActionAuth(req);
  if ("response" in assurance) return assurance.response;

  const serviceClient = getServiceClient();
  const { orgId } = parsed.data;
  const { data: org } = await serviceClient
    .from("organizations")
    .select("id, slug, workspace_kind")
    .eq("id", orgId)
    .maybeSingle();
  if (!org || org.workspace_kind === "sandbox") {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  try {
    const hiddenUserIds = await fetchHiddenInternalUserIds(serviceClient, {
      isGridmaster: false,
      userId: auth.user.id,
    });
    const archive = await buildOrganizationArchive(serviceClient, orgId, hiddenUserIds);
    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: "org.exported",
      resourceType: "organization",
      resourceId: orgId,
      orgId,
      request: req,
    });
    return new Response(archive, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${archiveFilename(org.slug as string | null)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error({ error, orgId }, "Gridmaster organization export failed");
    return NextResponse.json(
      { error: "We couldn't prepare that organization's data. Try again." },
      { status: 500 },
    );
  }
}
