import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_TRIAL_DAYS } from "@dubgrid/domain";
import type { DbOrganization } from "@dubgrid/db-types";
import {
  createRequestSupabaseClient,
  requireGridmasterSession,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { composeOrganizationAddress } from "@/lib/organization-profile";
import { rowToOrganization } from "@/lib/db/mappers";
import { ORGANIZATION_WITH_BILLING_COLS } from "@/lib/db/shared";
import { getServiceClient } from "@/lib/supabase-service";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";

export const dynamic = "force-dynamic";

function trialEndFrom(date: Date): string {
  return new Date(
    date.getTime() + DEFAULT_TRIAL_DAYS * 86_400_000,
  ).toISOString();
}

const createSetupSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  addressLine1: z.string().trim(),
  addressLine2: z.string().trim(),
  addressCity: z.string().trim(),
  addressState: z.string().trim(),
  addressPostalCode: z.string().trim(),
  addressCountry: z.string().trim(),
  phone: z.string().trim(),
  timezone: z.string().trim(),
  focusAreaLabel: z.string().trim(),
  certificationLabel: z.string().trim(),
  roleLabel: z.string().trim(),
  shiftDisplayMode: z.enum(["code", "name"]),
  superAdminFirstName: z.string().trim().optional(),
  superAdminLastName: z.string().trim().optional(),
  superAdminEmail: z.string().trim().email().optional(),
  superAdminPhone: z.string().trim().optional(),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("archiveOrganization"),
    orgId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("restoreOrganization"),
    orgId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("suspendOrganization"),
    orgId: z.string().uuid(),
    reason: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("unsuspendOrganization"),
    orgId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("assignOrgRoleByEmail"),
    orgId: z.string().uuid(),
    email: z.string().trim().email(),
    role: z.enum(["super_admin", "admin", "user"]),
  }),
  z.object({
    action: z.literal("createOrganizationSetup"),
    input: createSetupSchema,
  }),
]);

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) {
    return csrfError;
  }

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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const requestClient = createRequestSupabaseClient(req);
  const serviceClient = getServiceClient();

  try {
    switch (parsed.data.action) {
      case "archiveOrganization": {
        const { error } = await serviceClient
          .from("organizations")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", parsed.data.orgId);
        if (error) {
          throw error;
        }
        await writeGridmasterAuditLog({
          serviceClient,
          actor: auth.user,
          action: "org.archived",
          resourceType: "organization",
          resourceId: parsed.data.orgId,
          orgId: parsed.data.orgId,
          request: req,
        });
        return NextResponse.json({ success: true });
      }

      case "restoreOrganization": {
        const { error } = await serviceClient
          .from("organizations")
          .update({ archived_at: null })
          .eq("id", parsed.data.orgId);
        if (error) {
          throw error;
        }
        await writeGridmasterAuditLog({
          serviceClient,
          actor: auth.user,
          action: "org.restored",
          resourceType: "organization",
          resourceId: parsed.data.orgId,
          orgId: parsed.data.orgId,
          request: req,
        });
        return NextResponse.json({ success: true });
      }

      case "suspendOrganization": {
        const { error } = await serviceClient
          .from("organizations")
          .update({
            suspended_at: new Date().toISOString(),
            suspended_reason: parsed.data.reason,
          })
          .eq("id", parsed.data.orgId);
        if (error) {
          throw error;
        }
        await writeGridmasterAuditLog({
          serviceClient,
          actor: auth.user,
          action: "org.suspended",
          resourceType: "organization",
          resourceId: parsed.data.orgId,
          orgId: parsed.data.orgId,
          details: { reason: parsed.data.reason },
          request: req,
        });
        return NextResponse.json({ success: true });
      }

      case "unsuspendOrganization": {
        const { error } = await serviceClient
          .from("organizations")
          .update({
            suspended_at: null,
            suspended_reason: null,
          })
          .eq("id", parsed.data.orgId);
        if (error) {
          throw error;
        }
        await writeGridmasterAuditLog({
          serviceClient,
          actor: auth.user,
          action: "org.unsuspended",
          resourceType: "organization",
          resourceId: parsed.data.orgId,
          orgId: parsed.data.orgId,
          request: req,
        });
        return NextResponse.json({ success: true });
      }

      case "assignOrgRoleByEmail": {
        const { error } = await requestClient.rpc("assign_org_role_by_email", {
          p_email: parsed.data.email,
          p_org_id: parsed.data.orgId,
          p_org_role: parsed.data.role,
        });
        if (error) {
          throw error;
        }
        await writeGridmasterAuditLog({
          serviceClient,
          actor: auth.user,
          action: "role.assigned",
          resourceType: "organization_membership",
          resourceId: parsed.data.orgId,
          orgId: parsed.data.orgId,
          details: {
            target_email: parsed.data.email,
            role: parsed.data.role,
          },
          request: req,
        });
        return NextResponse.json({ success: true });
      }

      case "createOrganizationSetup": {
        const input = parsed.data.input;
        const address = composeOrganizationAddress({
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          addressCity: input.addressCity,
          addressState: input.addressState,
          addressPostalCode: input.addressPostalCode,
          addressCountry: input.addressCountry,
        });

        const { data: row, error } = await serviceClient
          .from("organizations")
          .insert({
            name: input.name,
            slug: input.slug?.trim() || null,
            address,
            address_line_1: input.addressLine1,
            address_line_2: input.addressLine2,
            address_city: input.addressCity,
            address_state: input.addressState,
            address_postal_code: input.addressPostalCode,
            address_country: input.addressCountry,
            phone: input.phone,
            employee_count: null,
            focus_area_label: input.focusAreaLabel || "Focus Areas",
            certification_label: input.certificationLabel || "Certifications",
            role_label: input.roleLabel || "Roles",
            department_label: "Scheduled Departments",
            shift_display_mode: input.shiftDisplayMode,
            timezone: input.timezone || null,
            pay_period_start_date: null,
            subscription_status: "trialing",
            trial_ends_at: trialEndFrom(new Date()),
            enforce_conflict_prevention: false,
            data_retention_days: 365,
            feature_overrides: {},
          })
          .select(ORGANIZATION_WITH_BILLING_COLS)
          .single();
        if (error) {
          throw error;
        }

        const org = rowToOrganization(row as DbOrganization);
        const email = input.superAdminEmail?.trim() ?? "";
        const firstName = input.superAdminFirstName?.trim() ?? "";
        const lastName = input.superAdminLastName?.trim() ?? "";
        const phone = input.superAdminPhone?.trim() ?? "";

        let superAdmin: Record<string, unknown> = { kind: "none" };

        if (email && firstName && lastName) {
          let employeeId: string | undefined;

          try {
            const { data: employeeRow, error: employeeError } = await serviceClient
              .from("employees")
              .insert({
                org_id: org.id,
                first_name: firstName,
                last_name: lastName,
                email,
                phone,
                seniority: 0,
                certification_id: null,
                role_ids: [],
                focus_area_ids: [],
                contact_notes: "",
                status: "active",
                status_changed_at: null,
                status_note: "",
                user_id: null,
                department_ids: [],
                dept_admin_ids: [],
                version: 0,
              })
              .select("id")
              .single();
            if (employeeError) {
              throw employeeError;
            }
            employeeId = employeeRow.id as string;
          } catch {
            employeeId = undefined;
          }

          const displayName = `${firstName} ${lastName}`.trim();
          const assignResult = await requestClient.rpc(
            "assign_org_role_by_email",
            {
              p_email: email,
              p_org_id: org.id,
              p_org_role: "super_admin",
            },
          );

          if (!assignResult.error) {
            superAdmin = {
              kind: "assigned",
              displayName,
            };
          } else {
            const inviteResult = await requestClient.rpc("send_invitation", {
              p_email: email,
              p_role: "super_admin",
              p_org_id: org.id,
              p_employee_id: employeeId ?? null,
              p_first_name: firstName,
              p_last_name: lastName,
              p_phone: phone || null,
              p_department_ids: [],
              p_dept_admin_ids: [],
            });

            if (!inviteResult.error) {
              superAdmin = {
                kind: "pending-invite",
                displayName,
                pendingInvite: {
                  token: inviteResult.data.token as string,
                  email,
                  name: displayName,
                },
              };
            } else {
              superAdmin = {
                kind: "invite-error",
                displayName,
                message: inviteResult.error.message,
              };
            }
          }
        }

        await writeGridmasterAuditLog({
          serviceClient,
          actor: auth.user,
          action: "org.created",
          resourceType: "organization",
          resourceId: org.id,
          orgId: org.id,
          details: {
            name: org.name,
            slug: org.slug,
            super_admin: superAdmin,
          },
          request: req,
        });

        return NextResponse.json({
          success: true,
          org,
          superAdmin,
        });
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gridmaster organization request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
