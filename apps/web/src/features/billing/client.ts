"use client";

import type { OrganizationBillingSummary } from "@/types";
import { formatClientErrorMessage } from "@/lib/client-facing";

async function requestBillingJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(
      formatClientErrorMessage(body?.error, "Billing request failed."),
    );
  }

  return body as T;
}

export function fetchOrganizationBilling(
  orgId: string,
): Promise<OrganizationBillingSummary> {
  const params = new URLSearchParams({ orgId });
  return requestBillingJson<OrganizationBillingSummary>(
    `/api/billing?${params.toString()}`,
  );
}

export async function startBillingCheckout(input: {
  orgId: string;
  returnUrl: string;
}): Promise<string> {
  const body = await requestBillingJson<{ url: string | null }>(
    "/api/stripe/create-checkout",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!body.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }
  return body.url;
}

export async function completeBillingCheckout(input: {
  orgId: string;
  sessionId: string;
}): Promise<void> {
  await requestBillingJson<{ success: true }>(
    "/api/stripe/checkout-complete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function openBillingPortal(input: {
  orgId: string;
  returnUrl: string;
}): Promise<string> {
  const body = await requestBillingJson<{ url: string | null }>(
    "/api/stripe/billing-portal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!body.url) {
    throw new Error("Stripe did not return a billing portal URL.");
  }
  return body.url;
}
