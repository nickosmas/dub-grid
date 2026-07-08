import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import {
  buildOperationsReportCsv,
  buildOperationsReportPdf,
  isOperationsReportType,
  loadOperationsReport,
} from "@/features/reports/server/operations";
import { apiErrorResponse } from "@/lib/error-handling";
import { operationsQuerySchema, parseOperationsFilters, parseOperationsRange } from "../params";

export const dynamic = "force-dynamic";

const exportQuerySchema = operationsQuerySchema.extend({
  report: z.string().min(1),
  format: z.enum(["csv", "pdf"]).optional().default("csv"),
});

export async function GET(req: NextRequest) {
  const parsed = exportQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success || !isOperationsReportType(parsed.data.report)) {
    return NextResponse.json({ error: "Choose a valid report before exporting." }, { status: 400 });
  }

  let range;
  let filters;
  try {
    range = parseOperationsRange(parsed.data);
    filters = parseOperationsFilters(parsed.data, range);
  } catch (error) {
    return apiErrorResponse(error, "Check the report filters and try again.", 400);
  }

  try {
    const auth = await requireOrgPermissions(
      req,
      parsed.data.orgId,
      (permissions) => permissions.role === "admin" || permissions.isSuperAdmin === true,
    );
    if ("response" in auth) {
      return auth.response;
    }

    const payload = await loadOperationsReport(auth.serviceClient, {
      orgId: parsed.data.orgId,
      range,
      filters,
    });
    const filename = `reports-${parsed.data.report}-${range.startDate}-${range.endDate}.${parsed.data.format}`;

    await auth.serviceClient.from("audit_log").insert({
      org_id: parsed.data.orgId,
      actor_id: auth.actor.id,
      actor_email: auth.actor.email,
      action: "data.exported",
      resource_type: "data_export",
      resource_id: parsed.data.report,
      details: {
        type: "reports.operations",
        report: parsed.data.report,
        format: parsed.data.format,
        filters,
        startDate: range.startDate,
        endDate: range.endDate,
      },
    });

    if (parsed.data.format === "pdf") {
      const pdf = buildOperationsReportPdf(payload, parsed.data.report);
      return new Response(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(buildOperationsReportCsv(payload, parsed.data.report), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "reports.operations.export" },
    });
    logger.error({ error, orgId: parsed.data.orgId }, "Reports export failed");
    return NextResponse.json({ error: "Failed to export report" }, { status: 500 });
  }
}
