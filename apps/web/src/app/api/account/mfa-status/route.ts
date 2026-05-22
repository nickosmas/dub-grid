import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateSelfMfaStatus } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";

const mfaStatusSchema = z.object({
  enabled: z.boolean(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = mfaStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    return NextResponse.json({
      profile: await updateSelfMfaStatus(auth.user.id, parsed.data.enabled),
    });
  } catch (error) {
    console.error("account mfa status POST failed", error);
    return NextResponse.json(
      { error: "Failed to update MFA status" },
      { status: 500 },
    );
  }
}
