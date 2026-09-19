import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import type { DbOrganization } from "@dubgrid/db-types";
import { createRequestSupabaseClient, requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { composeOrganizationAddress } from "@/lib/organization-profile";
import { rowToOrganization } from "@/lib/db/mappers";
import { ORGANIZATION_WITH_BILLING_COLS } from "@/lib/db/shared";
import { getServiceClient } from "@/lib/supabase-service";
import { cacheDel, CacheKey } from "@/lib/cache";
import { cancelSubscription } from "@/lib/stripe";
import logger from "@/lib/logger";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { apiErrorResponse } from "@/lib/error-handling";
import { formatClientErrorMessage } from "@/lib/client-facing";

export const dynamic = "force-dynamic";

const MAX_ORGANIZATION_SLUG_LENGTH = 48;
const MAX_ORGANIZATION_SLUG_ATTEMPTS = 100;

function organizationSlugBase(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ORGANIZATION_SLUG_LENGTH);

  return normalized || "organization";
}

function organizationSlugCandidate(base: string, attempt: number): string {
  if (attempt === 1) return base;

  const suffix = `-${attempt}`;
  return `${base.slice(0, MAX_ORGANIZATION_SLUG_LENGTH - suffix.length)}${suffix}`;
}

const createSetupSchema = z.object({
  name: z.string().trim().min(1),
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

// The proxy caches org access and the login page caches the slug lookup
// (including its suspended/archived state) for up to a day; without this,
// members keep passing the gate after a suspension and the sign-in page keeps
// treating a closed organization as open (F-95, F-87).
async function invalidateOrganizationAccess(orgId: string, slug?: string | null): Promise<void> {
  const keys = [CacheKey.mwOrgAccess(orgId), CacheKey.organization(orgId)];
  if (slug) keys.push(CacheKey.orgBySlug(slug));
  await cacheDel(...keys);
}

// A Stripe failure must not block the archive: the row is already archived,
// so log it and report false for the audit row.
async function cancelOrganizationBilling(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<boolean> {
  try {
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) return false;
    await cancelSubscription(sub.stripe_subscription_id);
    await serviceClient.from("subscriptions").update({ status: "canceled" }).eq("org_id", orgId);
    await serviceClient
      .from("organizations")
      .update({ subscription_status: "canceled" })
      .eq("id", orgId);
    return true;
  } catch (stripeError) {
    logger.error(
      { err: stripeError, orgId, path: "/api/gridmaster/organizations/manage" },
      "Failed to cancel Stripe subscription on archive",
    );
    return false;
  }
}

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
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const requestClient = createRequestSupabaseClient(req);
  const serviceClient = getServiceClient();

  // Defense in depth: the gridmaster dashboard's organization list already
  // excludes sandbox orgs (workspace_kind = 'real' filter), so this should
  // be unreachable via the UI — but guard the API directly in case a
  // sandbox org id ever reaches this route. Sandbox lifecycle is owned by
  // the user + the cron cleanup job, not gridmaster tooling.
  if (parsed.data.action !== "createOrganizationSetup") {
    const { data: targetOrg, error: targetOrgError } = await serviceClient
      .from("organizations")
      .select("workspace_kind")
      .eq("id", parsed.data.orgId)
      .maybeSingle();
    if (targetOrgError) {
      return apiErrorResponse(targetOrgError, "Gridmaster organization request failed");
    }
    if (targetOrg?.workspace_kind === "sandbox") {
      return NextResponse.json(
        { error: "Sandbox organizations aren't managed here." },
        { status: 400 },
      );
    }
  }

  try {
    switch (parsed.data.action) {
      case "archiveOrganization": {
        const { data: archived, error } = await serviceClient
          .from("organizations")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", parsed.data.orgId)
          .select("id, slug")
          .maybeSingle();
        if (error) {
          throw error;
        }
        // Billing ends server-side, as the super admin's delete route does
        // (F-91). It used to be a fire-and-forget call from the browser that
        // the API never made on its own.
        const stripeCanceled = await cancelOrganizationBilling(serviceClient, parsed.data.orgId);
        await invalidateOrganizationAccess(parsed.data.orgId, archived?.slug);
        await writeGridmasterAuditLog({
          serviceClient,
          actor: auth.user,
          action: "org.archived",
          resourceType: "organization",
          resourceId: parsed.data.orgId,
          orgId: parsed.data.orgId,
          details: { stripeCanceled },
          request: req,
        });
        return NextResponse.json({ success: true, stripeCanceled });
      }

      case "restoreOrganization": {
        const { data: restored, error } = await serviceClient
          .from("organizations")
          .update({ archived_at: null })
          .eq("id", parsed.data.orgId)
          .select("id, slug")
          .maybeSingle();
        if (error) {
          throw error;
        }
        await invalidateOrganizationAccess(parsed.data.orgId, restored?.slug);
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
        const { data: suspended, error } = await serviceClient
          .from("organizations")
          .update({
            suspended_at: new Date().toISOString(),
            suspended_reason: parsed.data.reason,
          })
          .eq("id", parsed.data.orgId)
          .select("id, slug")
          .maybeSingle();
        if (error) {
          throw error;
        }
        await invalidateOrganizationAccess(parsed.data.orgId, suspended?.slug);
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
        const { data: unsuspended, error } = await serviceClient
          .from("organizations")
          .update({
            suspended_at: null,
            suspended_reason: null,
          })
          .eq("id", parsed.data.orgId)
          .select("id, slug")
          .maybeSingle();
        if (error) {
          throw error;
        }
        await invalidateOrganizationAccess(parsed.data.orgId, unsuspended?.slug);
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

        const slugBase = organizationSlugBase(input.name);
        let row: DbOrganization | null = null;

        for (let attempt = 1; attempt <= MAX_ORGANIZATION_SLUG_ATTEMPTS; attempt += 1) {
          const slug = organizationSlugCandidate(slugBase, attempt);
          const { data, error } = await serviceClient
            .from("organizations")
            .insert({
              name: input.name,
              // This names the wildcard subdomain, e.g. calmhaven.dubgrid.com.
              // Vercel serves it through the project's wildcard domain; no
              // per-organization domain registration is needed.
              slug,
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
              // The column is NOT NULL and defaults to 'UTC'. A gridmaster may
              // leave the time zone to the super admin's own onboarding, so an
              // empty value omits the column rather than sending NULL.
              ...(input.timezone ? { timezone: input.timezone } : {}),
              pay_period_start_date: null,
              subscription_status: "trialing",
              // trial_ends_at intentionally left NULL: the trial is "pending" until
              // the first super_admin logs in (the start_trial_for_org RPC, called
              // from the login flow, then starts the 14-day clock). See
              // packages/domain/src/billing.ts trial_pending.
              enforce_conflict_prevention: false,
              data_retention_days: 365,
              feature_overrides: {},
            })
            .select(ORGANIZATION_WITH_BILLING_COLS)
            .single();

          if (!error && data) {
            row = data as DbOrganization;
            break;
          }

          // `organizations.slug` is uniquely constrained. A concurrent
          // creation with the same name retries using -2, -3, and so on.
          if (error?.code !== "23505") {
            throw error;
          }
        }

        if (!row) {
          throw new Error("Unable to generate a unique organization subdomain.");
        }

        const org = rowToOrganization(row);

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
          const assignResult = await requestClient.rpc("assign_org_role_by_email", {
            p_email: email,
            p_org_id: org.id,
            p_org_role: "super_admin",
          });

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
                message: formatClientErrorMessage(
                  inviteResult.error,
                  "We couldn't send that invitation.",
                ),
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
            // The pending-invite token is a credential (it is what
            // /api/invitations/register accepts), so it goes to the response
            // for "Send Email" only and never into the audit row.
            super_admin: {
              kind: superAdmin.kind,
              displayName: superAdmin.displayName ?? null,
              email: email || null,
            },
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
    // The database refuses to let a terminated account back into an
    // organization; that is a conflict with the account's state, not a fault.
    const message =
      error instanceof Error
        ? error.message
        : String((error as { message?: unknown })?.message ?? "");
    if (message.includes("ACCOUNT_TERMINATED")) {
      return apiErrorResponse(error, "Gridmaster organization request failed", 409);
    }
    return apiErrorResponse(error, "Gridmaster organization request failed");
  }
}
