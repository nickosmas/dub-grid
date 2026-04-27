import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePersonStatusUpdateBodySchema,
  mobilePersonStatusUpdateResponseSchema,
} from "@dubgrid/contracts";
import { requireMobileAuth } from "@/features/mobile/server";
import { mapEmployeeToMobilePerson } from "./people";
import { rowToEmployee } from "@/lib/db/mappers";
import type { DbEmployee } from "@/lib/db/types";
import { EMPLOYEE_COLS } from "@/lib/db/shared";

export const dynamic = "force-dynamic";

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) {
    return null;
  }

  return forwarded.split(",")[0]?.trim() || null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  if (!auth.permissions.canManageEmployees) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = mobilePersonStatusUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { id } = await context.params;

  const { data: currentRow, error: currentError } = await auth.serviceClient
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("id", id)
    .eq("org_id", auth.currentOrg.id)
    .single();

  if (currentError) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const currentEmployee = rowToEmployee(currentRow as DbEmployee);
  if (currentEmployee.version !== parsed.data.expectedVersion) {
    return NextResponse.json(
      {
        error:
          "Employee status changed elsewhere. Review the latest values before saving again.",
        code: "EMPLOYEE_STATUS_CONFLICT",
        person: mapEmployeeToMobilePerson(currentEmployee),
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status_changed_at: now,
    version: parsed.data.expectedVersion + 1,
  };
  const action =
    parsed.data.action === "bench" ? "employee.benched" : "employee.activated";

  if (parsed.data.action === "bench") {
    update.status = "benched";
    update.status_note = parsed.data.note ?? "";
  } else {
    update.status = "active";
    update.status_note = "";
    update.archived_at = null;
  }

  const { data: updatedRow, error: updateError } = await auth.serviceClient
    .from("employees")
    .update(update)
    .eq("id", id)
    .eq("org_id", auth.currentOrg.id)
    .eq("version", parsed.data.expectedVersion)
    .select(EMPLOYEE_COLS)
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: "We couldn't update that person right now." },
      { status: 500 },
    );
  }

  if (!updatedRow) {
    const { data: latestRow, error: latestError } = await auth.serviceClient
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("id", id)
      .eq("org_id", auth.currentOrg.id)
      .single();

    if (latestError) {
      return NextResponse.json(
        { error: "We couldn't load the latest employee state." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Employee status changed elsewhere. Review the latest values before saving again.",
        code: "EMPLOYEE_STATUS_CONFLICT",
        person: mapEmployeeToMobilePerson(rowToEmployee(latestRow as DbEmployee)),
      },
      { status: 409 },
    );
  }

  const updatedEmployee = rowToEmployee(updatedRow as DbEmployee);

  await auth.serviceClient.from("audit_log").insert({
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action,
    resource_type: "employee",
    resource_id: id,
    details: {
      fromStatus: currentEmployee.status,
      toStatus: updatedEmployee.status,
      note: parsed.data.note ?? "",
      changedFields: ["status"],
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json(
    mobilePersonStatusUpdateResponseSchema.parse({
      success: true,
      person: mapEmployeeToMobilePerson(updatedEmployee),
    }),
  );
}
