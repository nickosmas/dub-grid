import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const insert = vi.fn();
const upsert = vi.fn();
const from = vi.fn((_table: string) => ({ insert, upsert }));
const captureException = vi.fn();

vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { recordInvoiceEvent, recordSeatChange } from "./billing-history";

const client = { from } as unknown as Parameters<typeof recordSeatChange>[0];
const invoice = {
  id: "in_123",
  currency: "usd",
  amount_paid: 4200,
  amount_due: 5000,
  period_start: 1_780_000_000,
  period_end: 1_782_592_000,
} as unknown as Stripe.Invoice;

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ error: null });
  upsert.mockResolvedValue({ error: null });
});

describe("recordSeatChange", () => {
  it("adds a seat row", async () => {
    await recordSeatChange(client, {
      orgId: "org-1",
      seats: 8,
      billableAppUsers: 7,
      source: "gridmaster",
    });

    expect(from).toHaveBeenCalledWith("subscription_seat_history");
    expect(insert).toHaveBeenCalledWith({
      org_id: "org-1",
      seats: 8,
      billable_app_users: 7,
      source: "gridmaster",
    });
  });

  it("reports a failed write without failing the billing change", async () => {
    insert.mockResolvedValueOnce({ error: { message: "boom" } });

    await expect(
      recordSeatChange(client, { orgId: "org-1", seats: 8, source: "stripe" }),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalled();
  });
});

describe("recordInvoiceEvent", () => {
  it("records what was paid, once per invoice and kind", async () => {
    const occurredAt = new Date("2026-06-01T00:00:00Z");
    await recordInvoiceEvent(client, { orgId: "org-1", invoice, kind: "paid", occurredAt });

    expect(from).toHaveBeenCalledWith("billing_invoice_events");
    expect(upsert).toHaveBeenCalledWith(
      {
        org_id: "org-1",
        stripe_invoice_id: "in_123",
        kind: "paid",
        amount_cents: 4200,
        currency: "usd",
        period_start: new Date(1_780_000_000 * 1000).toISOString(),
        period_end: new Date(1_782_592_000 * 1000).toISOString(),
        occurred_at: "2026-06-01T00:00:00.000Z",
      },
      { onConflict: "stripe_invoice_id,kind", ignoreDuplicates: true },
    );
  });

  it("records what was due for a failed invoice", async () => {
    await recordInvoiceEvent(client, {
      orgId: "org-1",
      invoice,
      kind: "failed",
      occurredAt: new Date(),
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failed", amount_cents: 5000 }),
      expect.anything(),
    );
  });

  it("skips an invoice without a currency", async () => {
    await recordInvoiceEvent(client, {
      orgId: "org-1",
      invoice: { ...invoice, currency: null } as unknown as Stripe.Invoice,
      kind: "paid",
      occurredAt: new Date(),
    });

    expect(upsert).not.toHaveBeenCalled();
  });
});
