import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import type { BillingOperationSummary, OrganizationBillingSummary } from "@/types";

type QueryClient = Pick<SupabaseClient, "from">;

type OrganizationBillingRow = {
  id: string;
  name: string;
  slug: string | null;
  stripe_customer_id: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  subscription_seats: number | null;
};

type SubscriptionBillingRow = {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: string | null;
  quantity: number | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  trial_end: string | null;
};

type BillingAuditRow = {
  id: number | string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type BillingActorContext = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null;

function actorDisplayName(actor: BillingActorContext): string | null {
  if (!actor?.user_metadata) return null;
  const metadata = actor.user_metadata;
  const fullName =
    typeof metadata.full_name === "string" && metadata.full_name.trim()
      ? metadata.full_name.trim()
      : typeof metadata.name === "string" && metadata.name.trim()
        ? metadata.name.trim()
        : null;
  if (fullName) return fullName;

  const firstName =
    typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const lastName =
    typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

export function isStripeBillingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_ID_MONTHLY &&
      process.env.STRIPE_WEBHOOK_SECRET,
  );
}

function getOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function resolveBillingReturnUrl(
  returnUrl: string,
  allowedOrigins: Array<string | null | undefined> = [],
): string | null {
  try {
    const parsedReturnUrl = new URL(returnUrl);
    const trustedOrigins = new Set(
      [
        getOrigin(process.env.NEXT_PUBLIC_SITE_URL),
        getOrigin(
          process.env.NEXT_PUBLIC_VERCEL_URL
            ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
            : null,
        ),
        ...allowedOrigins.map(getOrigin),
      ].filter((origin): origin is string => Boolean(origin)),
    );
    if (!trustedOrigins.has(parsedReturnUrl.origin)) return null;
    return parsedReturnUrl.toString();
  } catch {
    return null;
  }
}

function describeBillingOperation(action: string): string {
  switch (action) {
    case "billing.subscription_created":
      return "Subscription started";
    case "billing.subscription_updated":
      return "Subscription updated";
    case "billing.subscription_cancel_scheduled":
      return "Cancellation scheduled";
    case "billing.subscription_canceled":
      return "Subscription canceled";
    case "billing.payment_failed":
      return "Payment failed";
    case "billing.payment_succeeded":
      return "Payment succeeded";
    case "billing.payment_method_updated":
      return "Payment method updated";
    case "billing.billing_details_updated":
      return "Billing details updated";
    case "billing.portal_opened":
      return "Billing portal opened";
    case "billing.trial_extended":
      return "Trial extended";
    case "billing.seats_synced":
      return "Seats synced";
    case "billing.status_overridden":
      return "Billing status overridden";
    case "billing.synced":
      return "Billing synced";
    default:
      return action
        .replace(/^billing\./, "")
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function actorLabelForBillingOperation(
  row: BillingAuditRow,
  actor: BillingActorContext,
): string {
  const initiatedBy = row.details?.initiated_by;
  if (initiatedBy === "gridmaster" || initiatedBy === "gridmaster_sync") {
    return "Gridmaster";
  }
  if (actor?.id && row.actor_id === actor.id) {
    const name = actorDisplayName(actor);
    return name ? `You (${name})` : "You";
  }
  if (typeof row.actor_email === "string" && row.actor_email.trim()) {
    return row.actor_email;
  }
  if (initiatedBy === "stripe" || initiatedBy === "stripe_webhook") {
    return "Stripe";
  }
  return "System";
}

async function loadRecentBillingOperations(
  serviceClient: QueryClient,
  orgId: string,
  actor: BillingActorContext,
): Promise<BillingOperationSummary[]> {
  try {
    const { data, error } = await serviceClient
      .from("audit_log")
      .select("id, action, actor_id, actor_email, resource_type, resource_id, details, created_at")
      .eq("org_id", orgId)
      .like("action", "billing.%")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) return [];

    return ((data ?? []) as BillingAuditRow[]).map((row) => ({
      id: String(row.id),
      action: row.action,
      label: describeBillingOperation(row.action),
      actorLabel: actorLabelForBillingOperation(row, actor),
      resourceType: row.resource_type ?? "billing",
      resourceId: row.resource_id,
      details: row.details ?? {},
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

export async function countBillableAppUsers(
  serviceClient: QueryClient,
  orgId: string,
): Promise<number> {
  const [
    { data: employees, error: employeesError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    serviceClient
      .from("employees")
      .select("id, user_id")
      .eq("org_id", orgId)
      .is("archived_at", null),
    serviceClient
      .from("organization_memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .is("archived_at", null),
  ]);
  if (employeesError) throw employeesError;
  if (membershipsError) throw membershipsError;

  const linkedEmployeeUserIds = new Set(
    (employees ?? [])
      .map((row) => (row as { user_id?: string | null }).user_id)
      .filter((userId): userId is string => Boolean(userId)),
  );
  const managementOnlyUserCount = (memberships ?? []).filter((row) => {
    const userId = (row as { user_id?: string | null }).user_id;
    return userId && !linkedEmployeeUserIds.has(userId);
  }).length;

  return (employees?.length ?? 0) + managementOnlyUserCount;
}

export async function loadOrganizationBillingSummary(
  serviceClient: QueryClient,
  orgId: string,
  options: { canManageBilling: boolean; actor?: BillingActorContext },
): Promise<OrganizationBillingSummary> {
  const [
    { data: org, error: orgError },
    { data: subscription },
    appUserCount,
    recentOperations,
  ] = await Promise.all([
      serviceClient
        .from("organizations")
        .select(
          "id, name, slug, stripe_customer_id, subscription_status, trial_ends_at, subscription_seats",
        )
        .eq("id", orgId)
        .single(),
      serviceClient
        .from("subscriptions")
        .select(
          "stripe_subscription_id, stripe_customer_id, status, quantity, current_period_end, cancel_at, canceled_at, trial_end",
        )
        .eq("org_id", orgId)
        .maybeSingle(),
      countBillableAppUsers(serviceClient, orgId),
      loadRecentBillingOperations(serviceClient, orgId, options.actor ?? null),
    ]);

  if (orgError || !org) {
    throw new Error("Organization not found");
  }

  const orgRow = org as OrganizationBillingRow;
  const subscriptionRow = subscription as SubscriptionBillingRow | null;
  const subscriptionSeats =
    orgRow.subscription_seats ?? subscriptionRow?.quantity ?? null;
  const seatDelta =
    subscriptionSeats == null ? null : subscriptionSeats - appUserCount;

  return {
    orgId: orgRow.id,
    orgName: orgRow.name,
    orgSlug: orgRow.slug,
    status: orgRow.subscription_status ?? subscriptionRow?.status ?? null,
    trialEndsAt: orgRow.trial_ends_at ?? subscriptionRow?.trial_end ?? null,
    currentPeriodEnd: subscriptionRow?.current_period_end ?? null,
    cancelAt: subscriptionRow?.cancel_at ?? null,
    canceledAt: subscriptionRow?.canceled_at ?? null,
    subscriptionSeats,
    appUserCount,
    seatDelta,
    hasStripeCustomer: Boolean(
      orgRow.stripe_customer_id ?? subscriptionRow?.stripe_customer_id,
    ),
    hasStripeSubscription: Boolean(subscriptionRow?.stripe_subscription_id),
    stripeConfigured: isStripeBillingConfigured(),
    canManageBilling: options.canManageBilling,
    billingAccess: evaluateOrganizationBillingAccess({
      subscriptionStatus: orgRow.subscription_status ?? subscriptionRow?.status ?? null,
      trialEndsAt: orgRow.trial_ends_at ?? subscriptionRow?.trial_end ?? null,
    }),
    recentOperations,
  };
}
