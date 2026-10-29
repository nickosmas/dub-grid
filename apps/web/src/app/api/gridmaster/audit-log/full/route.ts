import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import logger from "@/lib/logger";
import { resolveAuditActionScope } from "@/lib/audit/audience";
import { authorizeAuditLogRead } from "@/lib/audit/authorize";
import { fetchFilteredAuditRows } from "@/lib/audit/server-query";
import { enrichAuditRows } from "@/lib/audit/enrich";
import { withShiftChanges } from "@/lib/audit/shift-changes";
import { fetchShiftChangeResolvers } from "@/app/api/shared/schedule";
import { collectGroupedPage } from "@/lib/audit/grouped-page";
import { groupActivityEntries } from "@/lib/audit/grouping";

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
  action: z.string().min(1).optional(),
  actionPrefix: z.string().min(1).optional(),
  // Comma-separated prefixes, OR'd. A single category can span several
  // ("Setup" covers focus_area., job., shift_category., …), and filtering
  // client-side after a paged fetch would drop rows out of the page.
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
  resourceType: z.string().min(1).optional(),
  actorId: z.string().uuid().optional(),
  target: z.string().min(1).max(200).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  highRiskOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  // Pages count entries, a run of the same change by one person counting once.
  group: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get("orgId") ?? undefined,
      action: req.nextUrl.searchParams.get("action") ?? undefined,
      actionPrefix: req.nextUrl.searchParams.get("actionPrefix") ?? undefined,
      actionPrefixes: req.nextUrl.searchParams.get("actionPrefixes") ?? undefined,
      resourceType: req.nextUrl.searchParams.get("resourceType") ?? undefined,
      actorId: req.nextUrl.searchParams.get("actorId") ?? undefined,
      target: req.nextUrl.searchParams.get("target") ?? undefined,
      startDate: req.nextUrl.searchParams.get("startDate") ?? undefined,
      endDate: req.nextUrl.searchParams.get("endDate") ?? undefined,
      highRiskOnly: req.nextUrl.searchParams.get("highRiskOnly") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
      group: req.nextUrl.searchParams.get("group") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
    }

    const reader = await authorizeAuditLogRead(req, parsed.data.orgId);
    if ("response" in reader) {
      return reader.response;
    }

    // An organization's own admins read through an allowlist of action names;
    // the RPC applies each as a prefix, so full names work without a migration.
    const scope = resolveAuditActionScope(reader.audience, parsed.data.actionPrefixes);
    if (scope.kind === "allowlist" && scope.actions.length === 0) {
      return NextResponse.json({ entries: [] });
    }
    const { group, ...query } = parsed.data;
    const filters = {
      ...query,
      orgId: reader.orgId,
      actionPrefixes: scope.kind === "open" ? scope.prefixes : scope.actions,
    };

    const page = group
      ? await collectGroupedPage(
          (offset, limit) =>
            fetchFilteredAuditRows(reader.serviceClient, { ...filters, offset, limit }),
          { offset: filters.offset ?? 0, limit: filters.limit ?? 50 },
        )
      : { rows: await fetchFilteredAuditRows(reader.serviceClient, filters), nextOffset: null };
    const entries = await withShiftChanges(
      await enrichAuditRows(reader.serviceClient, page.rows),
      (orgId) => fetchShiftChangeResolvers(reader.serviceClient, orgId),
    );

    if (group) {
      return NextResponse.json({
        entries: groupActivityEntries(entries),
        nextOffset: page.nextOffset,
      });
    }
    return NextResponse.json({
      entries,
    });
  } catch (error) {
    logger.error(
      { err: error, path: "/api/gridmaster/audit-log/full" },
      "gridmaster full audit-log GET failed",
    );
    return NextResponse.json(
      { error: "We couldn't load the activity log. Refresh and try again." },
      { status: 500 },
    );
  }
}
