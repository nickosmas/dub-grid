import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";

const sessionIdSchema = z.string().uuid();
const querySchema = z.object({
  orgId: z.string().uuid(),
  editorSessionId: sessionIdSchema,
});
const endSessionSchema = z.object({
  orgId: z.string().uuid(),
  targetEditorSessionId: sessionIdSchema,
  endingEditorSessionId: sessionIdSchema,
});

const canUseScheduleEditor = (permissions: {
  isGridmaster: boolean;
  isSuperAdmin: boolean;
  canEditShifts: boolean;
  canEditNotes: boolean;
}) =>
  permissions.isGridmaster ||
  permissions.isSuperAdmin ||
  permissions.canEditShifts ||
  permissions.canEditNotes;

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    orgId: req.nextUrl.searchParams.get("orgId"),
    editorSessionId: req.nextUrl.searchParams.get("editorSessionId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  try {
    const auth = await requireOrgPermissions(req, parsed.data.orgId, canUseScheduleEditor, {
      allowDuringSetup: true,
      allowLockedOrganization: true,
    });
    if ("response" in auth) return auth.response;

    const { data, error } = await auth.serviceClient
      .from("schedule_editor_session_terminations")
      .select("ended_at")
      .eq("org_id", auth.orgId)
      .eq("user_id", auth.actor.id)
      .eq("editor_session_id", parsed.data.editorSessionId)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ ended: data != null, endedAt: data?.ended_at ?? null });
  } catch (error) {
    logger.error({ error }, "schedule editor session status failed");
    return NextResponse.json(
      { error: "We couldn't verify this schedule session. Try again." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = endSessionSchema.safeParse(body);
  if (!parsed.success || parsed.data.targetEditorSessionId === parsed.data.endingEditorSessionId) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  try {
    const auth = await requireOrgPermissions(req, parsed.data.orgId, canUseScheduleEditor, {
      allowDuringSetup: true,
      allowLockedOrganization: true,
    });
    if ("response" in auth) return auth.response;

    const endedAt = new Date().toISOString();
    const { error } = await auth.serviceClient.from("schedule_editor_session_terminations").upsert(
      {
        org_id: auth.orgId,
        user_id: auth.actor.id,
        editor_session_id: parsed.data.targetEditorSessionId,
        ended_by_editor_session_id: parsed.data.endingEditorSessionId,
        ended_at: endedAt,
      },
      { onConflict: "org_id,user_id,editor_session_id" },
    );

    if (error) throw error;
    return NextResponse.json({ ended: true, endedAt });
  } catch (error) {
    logger.error({ error }, "schedule editor session termination failed");
    return NextResponse.json(
      { error: "We couldn't end the other schedule session. Try again." },
      { status: 500 },
    );
  }
}
