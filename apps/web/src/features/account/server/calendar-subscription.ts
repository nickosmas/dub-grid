import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CalendarSubscriptionStatus } from "@/features/account/shared/calendar-subscription";
import { getServiceClient } from "@/lib/supabase-service";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface CalendarFeedTokenRow {
  id: string;
  user_id: string;
  org_id: string;
  employee_id: string;
  token_hash: string;
  issued_at: string;
  revoked_at: string | null;
}

export interface CalendarFeedEmployee {
  id: string;
  orgId: string;
  userId: string;
  firstName: string;
  lastName: string;
  timeZone: string;
}

export class CalendarSubscriptionError extends Error {
  constructor(readonly code: "not_linked" | "already_active" | "not_active" | "conflict") {
    super(code);
    this.name = "CalendarSubscriptionError";
  }
}

export function createCalendarFeedToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashCalendarFeedToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isCalendarFeedToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

async function loadActiveLinkedEmployee(
  client: SupabaseClient,
  input: { userId: string; orgId: string; employeeId?: string },
): Promise<CalendarFeedEmployee | null> {
  let employeeQuery = client
    .from("employees")
    .select("id, org_id, user_id, first_name, last_name")
    .eq("user_id", input.userId)
    .eq("org_id", input.orgId)
    .eq("status", "active")
    .is("archived_at", null);

  if (input.employeeId) {
    employeeQuery = employeeQuery.eq("id", input.employeeId);
  }

  const [employeeResult, membershipResult, organizationResult, profileResult] = await Promise.all([
    employeeQuery.maybeSingle(),
    client
      .from("organization_memberships")
      .select("id")
      .eq("user_id", input.userId)
      .eq("org_id", input.orgId)
      .is("archived_at", null)
      .maybeSingle(),
    client
      .from("organizations")
      .select("id, timezone")
      .eq("id", input.orgId)
      .is("archived_at", null)
      .is("suspended_at", null)
      .maybeSingle(),
    client
      .from("profiles")
      .select("id")
      .eq("id", input.userId)
      .is("deactivated_at", null)
      // Platform termination is how a gridmaster cuts an account off: the
      // token hook refuses it at issue and requireOrgPermissions refuses the
      // token already held, but this feed answers an opaque URL, so without
      // this line a terminated person's calendar kept filling in.
      .is("terminated_at", null)
      .is("scheduled_deletion_at", null)
      .maybeSingle(),
  ]);

  if (employeeResult.error) throw employeeResult.error;
  if (membershipResult.error) throw membershipResult.error;
  if (organizationResult.error) throw organizationResult.error;
  if (profileResult.error) throw profileResult.error;

  const employee = employeeResult.data;
  if (!employee || !membershipResult.data || !organizationResult.data || !profileResult.data) {
    return null;
  }

  return {
    id: employee.id as string,
    orgId: employee.org_id as string,
    userId: employee.user_id as string,
    firstName: employee.first_name as string,
    lastName: employee.last_name as string,
    timeZone: (organizationResult.data.timezone as string | null) ?? "UTC",
  };
}

async function loadTokenForScope(
  client: SupabaseClient,
  input: { userId: string; orgId: string; employeeId: string },
): Promise<CalendarFeedTokenRow | null> {
  const { data, error } = await client
    .from("calendar_feed_tokens")
    .select("id, user_id, org_id, employee_id, token_hash, issued_at, revoked_at")
    .eq("user_id", input.userId)
    .eq("org_id", input.orgId)
    .eq("employee_id", input.employeeId)
    .maybeSingle();
  if (error) throw error;
  return (data as CalendarFeedTokenRow | null) ?? null;
}

async function requireActiveEmployee(
  client: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<CalendarFeedEmployee> {
  const employee = await loadActiveLinkedEmployee(client, { userId, orgId });
  if (!employee) throw new CalendarSubscriptionError("not_linked");
  return employee;
}

export async function getLinkedCalendarEmployee(
  userId: string,
  orgId: string,
): Promise<CalendarFeedEmployee> {
  return requireActiveEmployee(getServiceClient(), userId, orgId);
}

export async function getCalendarSubscriptionStatus(
  userId: string,
  orgId: string,
): Promise<CalendarSubscriptionStatus> {
  const client = getServiceClient();
  const employee = await requireActiveEmployee(client, userId, orgId);
  const row = await loadTokenForScope(client, { userId, orgId, employeeId: employee.id });
  return {
    active: Boolean(row && !row.revoked_at),
    issuedAt: row && !row.revoked_at ? row.issued_at : null,
  };
}

export async function issueCalendarSubscription(
  userId: string,
  orgId: string,
  mode: "create" | "rotate",
): Promise<{ rawToken: string; issuedAt: string }> {
  const client = getServiceClient();
  const employee = await requireActiveEmployee(client, userId, orgId);
  const current = await loadTokenForScope(client, { userId, orgId, employeeId: employee.id });
  const isActive = Boolean(current && !current.revoked_at);

  if (mode === "create" && isActive) {
    throw new CalendarSubscriptionError("already_active");
  }
  if (mode === "rotate" && !isActive) {
    throw new CalendarSubscriptionError("not_active");
  }

  const rawToken = createCalendarFeedToken();
  const tokenHash = hashCalendarFeedToken(rawToken);
  const issuedAt = new Date().toISOString();

  if (current) {
    let update = client
      .from("calendar_feed_tokens")
      .update({
        token_hash: tokenHash,
        issued_at: issuedAt,
        revoked_at: null,
        updated_at: issuedAt,
      })
      .eq("id", current.id)
      .eq("token_hash", current.token_hash);
    update = current.revoked_at
      ? update.not("revoked_at", "is", null)
      : update.is("revoked_at", null);
    const { data, error } = await update.select("issued_at").maybeSingle();
    if (error) throw error;
    if (!data) throw new CalendarSubscriptionError("conflict");
  } else {
    const { error } = await client.from("calendar_feed_tokens").insert({
      user_id: userId,
      org_id: orgId,
      employee_id: employee.id,
      token_hash: tokenHash,
      issued_at: issuedAt,
      updated_at: issuedAt,
    });
    if (error) {
      if (error.code === "23505") throw new CalendarSubscriptionError("conflict");
      throw error;
    }
  }

  return { rawToken, issuedAt };
}

export async function revokeCalendarSubscription(userId: string, orgId: string): Promise<void> {
  const client = getServiceClient();
  const employee = await requireActiveEmployee(client, userId, orgId);
  const revokedAt = new Date().toISOString();
  const { data, error } = await client
    .from("calendar_feed_tokens")
    .update({ revoked_at: revokedAt, updated_at: revokedAt })
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("employee_id", employee.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CalendarSubscriptionError("not_active");
}

export async function resolveCalendarFeed(rawToken: string): Promise<CalendarFeedEmployee | null> {
  if (!isCalendarFeedToken(rawToken)) return null;

  const client = getServiceClient();
  const { data, error } = await client
    .from("calendar_feed_tokens")
    .select("user_id, org_id, employee_id")
    .eq("token_hash", hashCalendarFeedToken(rawToken))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return loadActiveLinkedEmployee(client, {
    userId: data.user_id as string,
    orgId: data.org_id as string,
    employeeId: data.employee_id as string,
  });
}
