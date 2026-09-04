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
const MAX_SESSION_TERMINATIONS = 20;
const endSessionSchema = z
  .object({
    orgId: z.string().uuid(),
    targetEditorSessionIds: z.array(sessionIdSchema).min(1).max(MAX_SESSION_TERMINATIONS),
    endingEditorSessionId: sessionIdSchema,
  })
  .superRefine((value, context) => {
    if (value.targetEditorSessionIds.includes(value.endingEditorSessionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetEditorSessionIds"],
        message: "The current editor session cannot end itself.",
      });
    }
    if (new Set(value.targetEditorSessionIds).size !== value.targetEditorSessionIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetEditorSessionIds"],
        message: "Editor session ids must be unique.",
      });
    }
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

/**
 * True when the terminations table is not in the database yet.
 *
 * The table arrives with migration 013, and the only remote-apply path this
 * project has is a full reset, so an environment can legitimately run this code
 * before the table exists. Postgres reports that as `42P01`; PostgREST reports
 * its own schema-cache miss as `PGRST205`.
 */
function isMissingTerminationsTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "42P01" || code === "PGRST205";
}

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

    if (error) {
      // Degrade rather than 500 on every schedule load and tab refocus: with no
      // table there are no terminations, so no session has been ended.
      if (isMissingTerminationsTable(error)) {
        logger.warn({ error }, "schedule editor session terminations table missing");
        return NextResponse.json({ ended: false, endedAt: null });
      }
      throw error;
    }
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
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  try {
    const auth = await requireOrgPermissions(req, parsed.data.orgId, canUseScheduleEditor, {
      allowDuringSetup: true,
      allowLockedOrganization: true,
    });
    if ("response" in auth) return auth.response;

    const endedAt = new Date().toISOString();
    const terminations = parsed.data.targetEditorSessionIds.map((editorSessionId) => ({
      org_id: auth.orgId,
      user_id: auth.actor.id,
      editor_session_id: editorSessionId,
      ended_by_editor_session_id: parsed.data.endingEditorSessionId,
      ended_at: endedAt,
    }));
    const { error } = await auth.serviceClient
      .from("schedule_editor_session_terminations")
      .upsert(terminations, { onConflict: "org_id,user_id,editor_session_id" });

    if (error) {
      if (isMissingTerminationsTable(error)) {
        logger.warn({ error }, "schedule editor session terminations table missing");
        return NextResponse.json(
          { error: "Ending another schedule session isn't available in this environment yet." },
          { status: 503 },
        );
      }
      throw error;
    }
    return NextResponse.json({
      ended: true,
      endedAt,
      endedEditorSessionIds: parsed.data.targetEditorSessionIds,
    });
  } catch (error) {
    logger.error({ error }, "schedule editor session termination failed");
    return NextResponse.json(
      { error: "We couldn't end the other schedule session. Try again." },
      { status: 500 },
    );
  }
}
