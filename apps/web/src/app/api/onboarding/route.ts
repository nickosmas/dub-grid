import { NextRequest, NextResponse } from "next/server";
import { Timer, withTiming } from "@/lib/server-timing";
import { z } from "zod";
import { createRequestSupabaseClient, requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireOrgPermissions } from "@/app/api/shared/permissions";

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

    const orgAuth = await requireOrgPermissions(req, parsed.data.orgId, () => true, {
      allowDuringSetup: true,
      allowLockedOrganization: true,
    });
    if ("response" in orgAuth) return orgAuth.response;

    const result = await orgAuth.userClient.rpc("complete_onboarding", {
      p_org_id: orgAuth.orgId,
    });
    if (result.error) throw result.error;

    const { data: membership, error: verificationError } = await orgAuth.serviceClient
      .from("organization_memberships")
      .select("onboarding_completed_at")
      .eq("user_id", orgAuth.actor.id)
      .eq("org_id", orgAuth.orgId)
      .maybeSingle();
    if (verificationError) throw verificationError;

    const completedAt = membership?.onboarding_completed_at;
    if (typeof completedAt !== "string" || completedAt.length === 0) {
      return NextResponse.json(
        { error: "We couldn't confirm setup was saved. Try again." },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, completedAt });
  } catch (error) {
    logger.error({ error }, "onboarding POST failed");
    return NextResponse.json({ error: "We couldn't finish setup. Try again." }, { status: 500 });
  }
}

export const GET = withTiming(handleGET);
