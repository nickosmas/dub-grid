import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchSelfWorkProfileSnapshot } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get("orgId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    return NextResponse.json(
      await fetchSelfWorkProfileSnapshot(auth.user.id, parsed.data.orgId ?? null),
    );
  } catch (error) {
    console.error("account self GET failed", error);
    return NextResponse.json({ error: "Failed to load your profile" }, { status: 500 });
  }
}
