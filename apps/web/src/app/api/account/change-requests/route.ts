import { NextRequest, NextResponse } from "next/server";
import {
  createProfileChangeRequest,
  createProfileChangeRequestSchema,
  listOwnProfileChangeRequests,
} from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import { apiErrorResponse } from "@/lib/error-handling";
import { API_ERRORS } from "@dubgrid/client-errors";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;

  const requestedOrgId = req.nextUrl.searchParams.get("orgId");
  if (!requestedOrgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }
  const orgId = await resolveEffectiveOrgId(req, auth.user.id, requestedOrgId);

  const serviceClient = getServiceClient();
  const { data: membership } = await serviceClient
    .from("organization_memberships")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 });
  }

  const requests = await listOwnProfileChangeRequests({
    serviceClient,
    userId: auth.user.id,
    orgId,
  });
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = createProfileChangeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  try {
    const orgId = await resolveEffectiveOrgId(req, auth.user.id, parsed.data.orgId);
    const request = await createProfileChangeRequest({
      serviceClient: getServiceClient(),
      user: auth.user,
      orgId,
      type: parsed.data.type,
      requestedChanges: parsed.data.requestedChanges,
      requestNote: parsed.data.requestNote,
    });
    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "We couldn't create request. Try again.", 400);
  }
}
