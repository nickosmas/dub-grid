import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { validateCsrfOrigin } from "@/lib/csrf";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import logger from "@/lib/logger";
import { fetchFilteredAuditRows } from "@/lib/audit/server-query";

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
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    const rows = await fetchFilteredAuditRows(serviceClient, parsed.data);
    const entries = rows.map(mapAuditExportRow);

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
    logger.error(
      { err: error, path: "/api/gridmaster/audit-log/export" },
      "gridmaster audit export POST failed",
    );
    return NextResponse.json(
      { error: "We couldn't export the activity log. Try again." },
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

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
