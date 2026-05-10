import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { validateCsrfOrigin } from "@/lib/csrf";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";

const exportSchema = z.object({
  orgId: z.string().uuid().optional(),
  action: z.string().min(1).optional(),
  actionPrefix: z.string().min(1).optional(),
  resourceType: z.string().min(1).optional(),
  actorId: z.string().uuid().optional(),
  target: z.string().min(1).max(200).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  highRiskOnly: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(5000).optional().default(1000),
});

const HIGH_RISK_ACTION_PREFIXES = [
  "billing.",
  "gdpr.",
  "gridmaster_account.",
  "impersonation.",
];
const HIGH_RISK_ACTIONS = new Set([
  "account.deleted",
  "audit.exported",
  "feature_flags.updated",
  "org.archived",
  "org.suspended",
  "user.deactivated",
  "user.force_logout",
  "user.password_reset_sent",
]);

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) {
    return csrfError;
  }

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    let query = serviceClient
      .from("audit_log")
      .select("id, org_id, actor_id, actor_email, action, resource_type, resource_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit);

    if (parsed.data.orgId) query = query.eq("org_id", parsed.data.orgId);
    if (parsed.data.action) query = query.eq("action", parsed.data.action);
    if (parsed.data.actionPrefix) query = query.like("action", `${parsed.data.actionPrefix}%`);
    if (parsed.data.resourceType) query = query.eq("resource_type", parsed.data.resourceType);
    if (parsed.data.actorId) query = query.eq("actor_id", parsed.data.actorId);
    if (parsed.data.startDate) query = query.gte("created_at", parsed.data.startDate);
    if (parsed.data.endDate) query = query.lte("created_at", parsed.data.endDate);

    const { data, error } = await query;
    if (error) throw error;

    let entries = ((data ?? []) as Record<string, unknown>[]).map(mapAuditExportRow);
    if (parsed.data.highRiskOnly) {
      entries = entries.filter((entry) => isHighRiskAction(entry.action));
    }
    if (parsed.data.target) {
      const needle = parsed.data.target.toLowerCase();
      entries = entries.filter((entry) =>
        JSON.stringify(entry).toLowerCase().includes(needle),
      );
    }

    const exportedAt = new Date().toISOString();
    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: "audit.exported",
      resourceType: "audit_log",
      orgId: parsed.data.orgId ?? null,
      details: {
        filters: parsed.data,
        rowCount: entries.length,
        exportedAt,
      },
      request: req,
    });

    return NextResponse.json({
      exportedAt,
      rowCount: entries.length,
      entries,
    });
  } catch (error) {
    console.error("gridmaster audit export POST failed", error);
    return NextResponse.json(
      { error: "Failed to export audit log" },
      { status: 500 },
    );
  }
}

function mapAuditExportRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    orgId: stringOrNull(row.org_id),
    actorId: stringOrNull(row.actor_id),
    actorEmail: stringOrNull(row.actor_email),
    action: String(row.action ?? ""),
    resourceType: String(row.resource_type ?? ""),
    resourceId: stringOrNull(row.resource_id),
    details: objectOrEmpty(row.details),
    createdAt: String(row.created_at ?? ""),
  };
}

function isHighRiskAction(action: string) {
  return HIGH_RISK_ACTIONS.has(action) || HIGH_RISK_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix));
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
