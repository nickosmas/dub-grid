import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { emailContactConflict } from "@/lib/employee-contact-conflicts";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import {
  buildPersonRecordForUser,
  throwUnlessNotFound,
} from "@/features/gridmaster/server/person-record";
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

/** Runs after the change has committed, so a failed audit write is reported, not answered. */
async function recordAfterCommit(input: Parameters<typeof writeGridmasterAuditLog>[0]) {
  try {
    await writeGridmasterAuditLog(input);
  } catch (error) {
    logger.error({ error, action: input.action }, "gridmaster person audit write failed");
  }
}

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

interface Target {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** The account to change, or null for none and for a Gridmaster's own kind. */
async function loadTarget(client: SupabaseClient, userId: string): Promise<Target | null> {
  const [{ data: profile, error }, { data: authData, error: authError }] = await Promise.all([
    client
      .from("profiles")
      .select("platform_role, first_name, last_name")
      .eq("id", userId)
      .maybeSingle(),
    client.auth.admin.getUserById(userId),
  ]);
  if (error) throw error;
  throwUnlessNotFound(authError);
  const authUser = authData?.user;
  if (!profile || !authUser || profile.platform_role === "gridmaster") return null;
  return {
    userId,
    email: authUser.email ?? "",
    firstName: (profile.first_name as string | null) ?? null,
    lastName: (profile.last_name as string | null) ?? null,
  };
}

/** The organization a notice names: their first active membership, if any. */
async function primaryOrgId(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client
    .from("organization_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.org_id as string | undefined) ?? null;
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
    const target = await loadTarget(serviceClient, params.data.userId);
    if (!target) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    if (parsed.data.action === "editName") {
      const firstName = parsed.data.firstName || null;
      const lastName = parsed.data.lastName || null;
      const { error } = await serviceClient
        .from("profiles")
        .update({ first_name: firstName, last_name: lastName })
        .eq("id", target.userId);
      if (error) throw error;
      await recordAfterCommit({
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
      orgId: await primaryOrgId(serviceClient, target.userId),
      actorId: assurance.user.id,
      actorSessionId: assurance.sessionId,
    });
    await recordAfterCommit({
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
