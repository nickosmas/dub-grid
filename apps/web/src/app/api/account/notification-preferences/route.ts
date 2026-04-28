import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
} from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";

const channelsSchema = z.object({
  in_app: z.boolean(),
  email: z.boolean(),
});

const savePreferencesSchema = z.object({
  prefs: z.record(z.string(), channelsSchema),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json({
      prefs: await fetchNotificationPreferences(auth.user.id),
    });
  } catch (error) {
    console.error("account notification preferences GET failed", error);
    return NextResponse.json(
      { error: "Failed to load notification preferences" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
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

    const parsed = savePreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    return NextResponse.json({
      prefs: await saveNotificationPreferences(auth.user.id, parsed.data.prefs),
    });
  } catch (error) {
    console.error("account notification preferences PUT failed", error);
    return NextResponse.json(
      { error: "Failed to save notification preferences" },
      { status: 500 },
    );
  }
}
