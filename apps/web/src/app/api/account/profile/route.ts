import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateSelfProfileDetails } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";

const profileUpdateSchema = z.object({
  firstName: z.string().trim().nullable(),
  lastName: z.string().trim().nullable(),
  orgId: z.string().uuid().nullable(),
});

export async function PATCH(req: NextRequest) {
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

    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const firstName = parsed.data.firstName?.trim() || null;
    const lastName = parsed.data.lastName?.trim() || null;

    return NextResponse.json(
      await updateSelfProfileDetails({
        userId: auth.user.id,
        firstName,
        lastName,
        orgId: parsed.data.orgId,
      }),
    );
  } catch (error) {
    console.error("account profile PATCH failed", error);
    return NextResponse.json(
      { error: "Failed to update account details" },
      { status: 500 },
    );
  }
}
