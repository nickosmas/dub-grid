import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchUserSessionsForUser,
  revokeUserSessionForUser,
} from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";

const revokeSessionSchema = z.object({
  refreshTokenHash: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json({
      sessions: await fetchUserSessionsForUser(auth.user.id),
    });
  } catch (error) {
    console.error("account sessions GET failed", error);
    return NextResponse.json(
      { error: "Failed to load sessions" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
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

    const parsed = revokeSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    await revokeUserSessionForUser(auth.user.id, parsed.data.refreshTokenHash);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("account sessions DELETE failed", error);
    return NextResponse.json(
      { error: "Failed to revoke session" },
      { status: 500 },
    );
  }
}
