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

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

  const requests = await listOwnProfileChangeRequests({
    serviceClient: getServiceClient(),
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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createProfileChangeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const request = await createProfileChangeRequest({
      serviceClient: getServiceClient(),
      user: auth.user,
      orgId: parsed.data.orgId,
      type: parsed.data.type,
      requestedChanges: parsed.data.requestedChanges,
      requestNote: parsed.data.requestNote,
    });
    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Failed to create request.", 400);
  }
}
