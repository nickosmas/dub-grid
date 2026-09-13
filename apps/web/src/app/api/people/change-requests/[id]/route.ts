import { NextRequest, NextResponse } from "next/server";
import {
  fetchProfileChangeRequestForResolution,
  resolveProfileChangeRequest,
  resolveProfileChangeRequestSchema,
} from "@/features/account/server";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import { apiErrorResponse } from "@/lib/error-handling";
import { extractRawErrorMessage } from "@/lib/client-facing";
import { API_ERRORS } from "@dubgrid/client-errors";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

  const auth = await requireOrgPermissions(
    req,
    orgId,
    (permissions) =>
      permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageEmployees,
  );
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = resolveProfileChangeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const pendingRequest = await fetchProfileChangeRequestForResolution(
      auth.serviceClient,
      auth.orgId,
      id,
    );
    if (parsed.data.action === "approve" && pendingRequest.type === "account_deletion") {
      const assurance = await requireSensitiveActionAuth(req);
      if ("response" in assurance) return assurance.response;
    }

    const request = await resolveProfileChangeRequest({
      serviceClient: auth.serviceClient,
      actor: auth.actor,
      // Effective (sandbox-redirected) org, not the raw query param — this can
      // delete an account, so it must never act on the real org from a sandbox.
      orgId: auth.orgId,
      requestId: id,
      action: parsed.data.action,
      resolverNote: parsed.data.resolverNote,
      request: pendingRequest,
    });
    return NextResponse.json({ success: true, request });
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }

    const rawMessage = extractRawErrorMessage(error) ?? "";
    const status = rawMessage.includes("changed after") ? 409 : 400;
    return apiErrorResponse(error, "We couldn't resolve request. Try again.", status);
  }
}
