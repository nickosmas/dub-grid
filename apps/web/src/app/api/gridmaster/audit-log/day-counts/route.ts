import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";
import { resolveAuditActionScope } from "@/lib/audit/audience";
import { authorizeAuditLogRead } from "@/lib/audit/authorize";
import { bucketAuditDays } from "@/lib/audit/day-counts";

export const dynamic = "force-dynamic";

/**
 * Enough headroom that a real period is counted in full, while still bounding
 * the work. `truncated` tells the caller when even this was not enough.
 */
const MAX_ROWS = 5000;

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  timeZone: z
    .string()
    .min(1)
    .max(64)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone")
    .optional(),
  actionPrefixes: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter((part) => /^[a-z0-9_]+\.$/.test(part))
        : undefined,
    ),
  resourceType: z.string().min(1).max(64).optional(),
});

/**
 * How many events fall on each day of a period, independent of paging.
 *
 * The rows endpoint returns one page, so a busy period's day headings would
 * otherwise count only what happened to load. This counts the period itself.
 * It deliberately supports only the filters it can apply here; free-text
 * search and the high-risk filter live in the rows RPC's joins, so callers
 * using those keep counting their loaded page instead.
 */
export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get("orgId") ?? undefined,
      startDate: req.nextUrl.searchParams.get("startDate") ?? undefined,
      endDate: req.nextUrl.searchParams.get("endDate") ?? undefined,
      timeZone: req.nextUrl.searchParams.get("timeZone") ?? undefined,
      actionPrefixes: req.nextUrl.searchParams.get("actionPrefixes") ?? undefined,
      resourceType: req.nextUrl.searchParams.get("resourceType") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
    }

    const reader = await authorizeAuditLogRead(req, parsed.data.orgId);
    if ("response" in reader) {
      return reader.response;
    }

    // The same scope the rows route applies, so the period total matches them.
    const scope = resolveAuditActionScope(reader.audience, parsed.data.actionPrefixes);
    if (scope.kind === "allowlist" && scope.actions.length === 0) {
      return NextResponse.json(bucketAuditDays([], parsed.data.timeZone ?? null, MAX_ROWS));
    }

    let query = reader.serviceClient
      .from("audit_log")
      .select("created_at")
      .gte("created_at", parsed.data.startDate)
      .lte("created_at", parsed.data.endDate)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);

    if (parsed.data.orgId) {
      query = query.eq("org_id", parsed.data.orgId);
    }
    if (parsed.data.resourceType) {
      query = query.eq("resource_type", parsed.data.resourceType);
    }
    if (scope.kind === "allowlist") {
      query = query.in("action", scope.actions);
    } else if (scope.prefixes?.length) {
      query = query.or(scope.prefixes.map((prefix) => `action.like.${prefix}%`).join(","));
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return NextResponse.json(bucketAuditDays(data ?? [], parsed.data.timeZone ?? null, MAX_ROWS));
  } catch (error) {
    logger.error(
      { err: error, path: "/api/gridmaster/audit-log/day-counts" },
      "audit-log day-counts GET failed",
    );
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}
