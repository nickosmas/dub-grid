import { NextRequest, NextResponse } from "next/server";
import { cancelOwnProfileChangeRequest } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import { apiErrorResponse } from "@/lib/error-handling";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  try {
    const request = await cancelOwnProfileChangeRequest({
      serviceClient: getServiceClient(),
      userId: auth.user.id,
      requestId: id,
    });
    return NextResponse.json({ success: true, request });
  } catch (error) {
    return apiErrorResponse(error, "We couldn't cancel request. Try again.", 400);
  }
}
