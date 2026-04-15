import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { sendNotification } from "@/lib/notifications";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import type { NotificationType } from "@/types";

// ── Input schemas ────────────────────────────────────────────────────────

const shiftRequestSchema = z.object({
  action: z.enum([
    "shift_request_created",
    "shift_request_claimed",
    "shift_request_resolved",
  ]),
  orgId: z.string().uuid(),
  requestId: z.string().uuid(),
  requestType: z.enum(["pickup", "swap", "calloff"]),
  /** For resolved: was it approved or rejected? */
  approved: z.boolean().optional(),
  /** For resolved: optional admin note */
  adminNote: z.string().max(500).optional(),
});

const schedulePublishedSchema = z.object({
  action: z.literal("schedule_published"),
  orgId: z.string().uuid(),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(),
});

const roleChangedSchema = z.object({
  action: z.literal("role_changed"),
  orgId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  fromRole: z.string().max(50),
  toRole: z.string().max(50),
});

const bodySchema = z.discriminatedUnion("action", [
  shiftRequestSchema,
  schedulePublishedSchema,
  roleChangedSchema,
]);

// ── Helpers ──────────────────────────────────────────────────────────────

/** Get user IDs of admins who have a specific permission in this org. */
async function getAdminsWithPermission(
  orgId: string,
  permission: string,
): Promise<string[]> {
  const db = getServiceClient();

  // super_admins always have all permissions
  const { data: superAdmins } = await db
    .from("organization_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("org_role", "super_admin");

  // admins with the specific permission enabled
  const { data: admins } = await db
    .from("organization_memberships")
    .select("user_id, admin_permissions")
    .eq("org_id", orgId)
    .eq("org_role", "admin");

  const ids = new Set<string>();
  for (const row of superAdmins ?? []) {
    ids.add(row.user_id);
  }
  for (const row of admins ?? []) {
    const perms = row.admin_permissions as Record<string, boolean> | null;
    if (perms?.[permission]) {
      ids.add(row.user_id);
    }
  }
  return [...ids];
}

/** Get user IDs of employees who have shifts in a date range. */
async function getAffectedEmployeeUserIds(
  orgId: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const db = getServiceClient();

  // Get employees with published shifts in the date range
  const { data: shifts } = await db
    .from("shifts")
    .select("emp_id")
    .eq("org_id", orgId)
    .gte("date", startDate)
    .lte("date", endDate)
    .not("published_shift_code_ids", "is", null);

  if (!shifts?.length) return [];

  const empIds = [...new Set(shifts.map((s) => s.emp_id))];

  // Look up user_ids for these employees
  const { data: employees } = await db
    .from("employees")
    .select("user_id")
    .in("id", empIds)
    .not("user_id", "is", null);

  return (employees ?? [])
    .map((e) => e.user_id as string)
    .filter(Boolean);
}

/** Get info about a shift request: requester user_id and name. */
async function getRequestInfo(
  requestId: string,
): Promise<{ userId: string | null; requesterName: string }> {
  const db = getServiceClient();
  const { data } = await db
    .from("shift_requests")
    .select("requester:employees!shift_requests_requester_emp_id_fkey(user_id, first_name, last_name)")
    .eq("id", requestId)
    .single();

  // Supabase returns joined rows as arrays; single-row FK join returns [row] or []
  const requesterArr = data?.requester as
    | { user_id: string | null; first_name: string; last_name: string }[]
    | null;
  const requester = requesterArr?.[0] ?? null;
  return {
    userId: requester?.user_id ?? null,
    requesterName: requester
      ? `${requester.first_name} ${requester.last_name}`
      : "An employee",
  };
}

// ── Route handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── CSRF ────────────────────────────────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Auth ────────────────────────────────────────────────────────────
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;
  const { user, claims } = auth;

  // ── Rate limit ──────────────────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(
    apiLimiter,
    user.id,
  );
  if (misconfigured) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }
  if (limited) {
    const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 60;
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;

  // ── Org isolation: verify the caller's JWT org_id matches the body orgId ──
  const claimOrgId = typeof claims.org_id === "string" ? claims.org_id : null;
  if (claimOrgId && claimOrgId !== data.orgId) {
    return NextResponse.json(
      { error: "Org mismatch: cannot send notifications for another org" },
      { status: 403 },
    );
  }

  try {
    switch (data.action) {
      // ── Shift request notifications ───────────────────────────────
      case "shift_request_created": {
        const { requesterName } = await getRequestInfo(data.requestId);
        const adminIds = await getAdminsWithPermission(
          data.orgId,
          "canApproveShiftRequests",
        );
        const typeLabel =
          data.requestType === "calloff"
            ? "calloff"
            : data.requestType === "swap"
              ? "swap"
              : "pickup";

        await Promise.all(
          adminIds
            .filter((id) => id !== user.id)
            .map((adminId) =>
              sendNotification(
                adminId,
                data.orgId,
                "shift_request_new" as NotificationType,
                `New ${typeLabel} request`,
                `${requesterName} submitted a ${typeLabel} request that needs your approval.`,
                { requestId: data.requestId, requestType: data.requestType },
              ),
            ),
        );
        break;
      }

      case "shift_request_claimed": {
        const { requesterName: claimerName } = await getRequestInfo(data.requestId);
        const adminIds = await getAdminsWithPermission(
          data.orgId,
          "canApproveShiftRequests",
        );
        await Promise.all(
          adminIds
            .filter((id) => id !== user.id)
            .map((adminId) =>
              sendNotification(
                adminId,
                data.orgId,
                "shift_request_new" as NotificationType,
                "Shift pickup claimed",
                `${claimerName} claimed a pickup request that needs your approval.`,
                { requestId: data.requestId, requestType: "pickup" },
              ),
            ),
        );
        break;
      }

      case "shift_request_resolved": {
        const { userId } = await getRequestInfo(data.requestId);
        if (userId && userId !== user.id) {
          const status = data.approved ? "approved" : "rejected";
          const notifType: NotificationType = data.approved
            ? "shift_request_approved"
            : "shift_request_rejected";
          const noteText = data.adminNote
            ? ` Note: ${data.adminNote}`
            : "";

          await sendNotification(
            userId,
            data.orgId,
            notifType,
            `Request ${status}`,
            `Your ${data.requestType} request has been ${status}.${noteText}`,
            {
              requestId: data.requestId,
              requestType: data.requestType,
              approved: data.approved,
            },
          );
        }
        break;
      }

      // ── Schedule published ────────────────────────────────────────
      case "schedule_published": {
        const userIds = await getAffectedEmployeeUserIds(
          data.orgId,
          data.startDate,
          data.endDate,
        );

        await Promise.all(
          userIds
            .filter((id) => id !== user.id) // Don't notify the publisher
            .map((userId) =>
              sendNotification(
                userId,
                data.orgId,
                "schedule_published" as NotificationType,
                "Schedule updated",
                `A new schedule has been published for ${data.startDate} to ${data.endDate}. Check the schedule page for your shifts.`,
                { startDate: data.startDate, endDate: data.endDate },
              ),
            ),
        );
        break;
      }

      // ── Role changed ──────────────────────────────────────────────
      case "role_changed": {
        if (data.targetUserId !== user.id) {
          await sendNotification(
            data.targetUserId,
            data.orgId,
            "system" as NotificationType,
            "Your role has been updated",
            `Your role has been changed from ${data.fromRole} to ${data.toRole}.`,
            { fromRole: data.fromRole, toRole: data.toRole },
          );
        }
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "send-notification" } });
    logger.error(
      { err, action: data.action },
      "Failed to send notification",
    );
    return NextResponse.json(
      { error: "Failed to send notification" },
      { status: 500 },
    );
  }
}
