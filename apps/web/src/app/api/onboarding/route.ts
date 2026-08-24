import { NextRequest, NextResponse } from "next/server";
import { Timer, withTiming } from "@/lib/server-timing";
import { z } from "zod";
import { createRequestSupabaseClient, requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import { API_ERRORS } from "@dubgrid/client-errors";

const searchSchema = z.object({
  orgId: z.string().uuid(),
});

const postSchema = z.object({
  orgId: z.string().uuid(),
});

async function handleGET(req: NextRequest, timer: Timer) {
  try {
    const auth = await timer.time("auth", () => requireAuthenticatedUser(req));
    if ("response" in auth) {
      return auth.response;
    }
    const { user } = auth;

    const parsed = searchSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    const { data, error } = await supabase
      .from("organization_memberships")
      .select("onboarding_completed_at, tooltip_tours_completed")
      .eq("user_id", user.id)
      .eq("org_id", parsed.data.orgId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      completed: !!data?.onboarding_completed_at,
      completedAt: data?.onboarding_completed_at ?? null,
      tooltipToursCompleted: (data?.tooltip_tours_completed as Record<string, string>) ?? {},
    });
  } catch (error) {
    logger.error({ error }, "onboarding GET failed");
    return NextResponse.json(
      { error: "We couldn't check your setup progress. Try again." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    const result = await supabase.rpc("complete_onboarding", {
      p_org_id: parsed.data.orgId,
    });
    if (result.error) throw result.error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "onboarding POST failed");
    return NextResponse.json({ error: "We couldn't finish setup. Try again." }, { status: 500 });
  }
}

export const GET = withTiming(handleGET);
