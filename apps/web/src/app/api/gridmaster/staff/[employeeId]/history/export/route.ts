import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { loadPersonHistory } from "@/features/gridmaster/server/person-history";

const paramsSchema = z.object({ employeeId: z.string().uuid() });

const NOT_FOUND = "We couldn't find that staff record. Refresh the page and try again.";

export async function POST(req: NextRequest, context: { params: Promise<{ employeeId: string }> }) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;
    // An export copies one person's whole history out of DubGrid, so it needs
    // the same fresh proof as the platform audit export (F-17).
    const assurance = await requireSensitiveActionAuth(req);
    if ("response" in assurance) return assurance.response;

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) return NextResponse.json({ error: NOT_FOUND }, { status: 400 });

    const serviceClient = getServiceClient();
    const history = await loadPersonHistory(serviceClient, {
      kind: "staff",
      employeeId: parsed.data.employeeId,
    });
    if (!history) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const exportedAt = new Date().toISOString();
    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: "audit.exported",
      resourceType: "employee",
      resourceId: parsed.data.employeeId,
      details: {
        scope: "person_history",
        rowCount: history.entries.length,
        truncated: history.truncated,
        exportedAt,
      },
      request: req,
    });

    return NextResponse.json({ exportedAt, rowCount: history.entries.length, ...history });
  } catch (error) {
    logger.error({ error }, "gridmaster person history export failed");
    return NextResponse.json(
      { error: "We couldn't export this history. Try again." },
      { status: 500 },
    );
  }
}
