import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { emailContactConflict } from "@/lib/employee-contact-conflicts";
import { writeGridmasterAuditLogAfterCommit } from "@/app/api/gridmaster/_lib/audit";
import { buildPersonRecordForUser } from "@/features/gridmaster/server/person-record";
import { loadPersonTarget, loadPrimaryOrgId } from "@/features/gridmaster/server/person-target";
import { checkEmployeeEmailConflict } from "@/features/employees/server/contact-conflicts";
import {
  LoginEmailConflictError,
  syncLinkedLoginEmail,
} from "@/features/employees/server/login-email";
import { followUpLinkedLoginEmailChange } from "@/features/employees/server/login-email-follow-up";

const paramsSchema = z.object({ userId: z.string().uuid() });

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("editName"),
    firstName: z.string().trim().max(100),
    lastName: z.string().trim().max(100),
  }),
  z.object({
    action: z.literal("changeEmail"),
    email: z.string().trim().toLowerCase().email().max(320),
  }),
]);

const NOT_FOUND = "We couldn't find that account. Refresh the page and try again.";

export async function GET(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) return NextResponse.json({ error: NOT_FOUND }, { status: 400 });

    const person = await buildPersonRecordForUser(getServiceClient(), parsed.data.userId);
    if (!person) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ person });
  } catch (error) {
    logger.error({ error }, "gridmaster person GET failed");
    return NextResponse.json(
      { error: "We couldn't load this person. Refresh and try again." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    const assurance = await requireSensitiveActionAuth(req);
    if ("response" in assurance) return assurance.response;

    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: NOT_FOUND }, { status: 400 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    const target = await loadPersonTarget(serviceClient, params.data.userId);
    if (!target) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    if (parsed.data.action === "editName") {
      const firstName = parsed.data.firstName || null;
      const lastName = parsed.data.lastName || null;
      const { error } = await serviceClient
        .from("profiles")
        .update({ first_name: firstName, last_name: lastName })
        .eq("id", target.userId);
      if (error) throw error;
      await writeGridmasterAuditLogAfterCommit({
        serviceClient,
        actor: auth.user,
        action: "user.name_changed",
        resourceType: "user",
        resourceId: target.userId,
        details: {
          targetUserId: target.userId,
          previous: { firstName: target.firstName, lastName: target.lastName },
          next: { firstName, lastName },
        },
        request: req,
      });
      return NextResponse.json({ success: true });
    }

    const email = parsed.data.email;
    if (email === target.email.toLowerCase()) {
      return NextResponse.json({ error: "That's already their sign-in email." }, { status: 400 });
    }

    // The trigger that follows the account's email rewrites every linked
    // staff row, so each organization's own uniqueness has to hold first.
    const { data: staffRows, error: staffError } = await serviceClient
      .from("employees")
      .select("id, org_id")
      .eq("user_id", target.userId);
    if (staffError) throw staffError;
    for (const row of staffRows ?? []) {
      const conflict = await checkEmployeeEmailConflict(serviceClient, {
        orgId: row.org_id as string,
        email,
        excludeEmployeeId: row.id as string,
        currentUserId: target.userId,
      });
      if (conflict.conflict) {
        return NextResponse.json(emailContactConflict(conflict.reason ?? "employee_duplicate"), {
          status: 409,
        });
      }
    }

    try {
      await syncLinkedLoginEmail(serviceClient, { userId: target.userId, email });
    } catch (error) {
      if (error instanceof LoginEmailConflictError) {
        return NextResponse.json(error.conflict, { status: 409 });
      }
      throw error;
    }

    await followUpLinkedLoginEmailChange({
      serviceClient,
      userId: target.userId,
      previousEmail: target.email || null,
      newEmail: email,
      orgId: await loadPrimaryOrgId(serviceClient, target.userId),
      actorId: assurance.user.id,
      actorSessionId: assurance.sessionId,
    });
    await writeGridmasterAuditLogAfterCommit({
      serviceClient,
      actor: auth.user,
      action: "user.email_changed",
      resourceType: "user",
      resourceId: target.userId,
      details: { targetUserId: target.userId, previousEmail: target.email, newEmail: email },
      request: req,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "gridmaster person PATCH failed");
    return NextResponse.json(
      { error: "We couldn't save that change. Try again." },
      { status: 500 },
    );
  }
}
