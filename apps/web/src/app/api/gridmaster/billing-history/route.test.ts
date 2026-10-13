import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const results = new Map<string, { data: unknown; error: unknown }>();
const orgFilter = vi.fn();

function builder(key: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "gte", "order"]) chain[method] = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    orgFilter(column, value);
    return chain;
  });
  chain.limit = vi.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(results.get(key) ?? { data: [], error: null }).then(resolve);
  return chain;
}

let invoiceCalls = 0;
vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) =>
      table === "billing_invoice_events"
        ? builder(invoiceCalls++ === 0 ? "invoices" : "firstInvoice")
        : builder("seats"),
  }),
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function get(query = "") {
  return GET(new NextRequest(`http://localhost/api/gridmaster/billing-history${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  results.clear();
  invoiceCalls = 0;
  requireGridmasterSession.mockResolvedValue({ user: { id: "gm-1" } });
});

describe("GET /api/gridmaster/billing-history", () => {
  it("stays Gridmaster-only", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    expect((await get()).status).toBe(403);
  });

  it("reports months from the first recorded row", async () => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    results.set("invoices", {
      data: [
        {
          org_id: "a",
          kind: "paid",
          amount_cents: 4200,
          currency: "usd",
          occurred_at: new Date().toISOString(),
        },
      ],
      error: null,
    });
    results.set("firstInvoice", { data: [{ occurred_at: new Date().toISOString() }], error: null });
    results.set("seats", {
      data: [{ org_id: "a", seats: 7, recorded_at: new Date().toISOString() }],
      error: null,
    });

    const body = await (await get()).json();

    expect(body.since).toEqual(expect.any(String));
    expect(body.months).toEqual([
      {
        month: thisMonth,
        revenue: [{ currency: "usd", paidCents: 4200 }],
        failedInvoices: 0,
        billedSeats: 7,
      },
    ]);
  });

  it("says when nothing has been recorded", async () => {
    expect(await (await get()).json()).toEqual({ since: null, months: [] });
  });

  it("lists one organization's recent seat changes", async () => {
    results.set("seats", {
      data: [
        {
          seats: 9,
          billable_app_users: 9,
          source: "gridmaster",
          recorded_at: "2026-10-01T00:00:00Z",
        },
      ],
      error: null,
    });

    const body = await (await get(`?orgId=${ORG_ID}`)).json();

    expect(orgFilter).toHaveBeenCalledWith("org_id", ORG_ID);
    expect(body.seats).toHaveLength(1);
  });

  it("refuses a malformed organization id", async () => {
    expect((await get("?orgId=nope")).status).toBe(400);
  });

  it("reports a failed read", async () => {
    results.set("seats", { data: null, error: { message: "boom" } });

    expect((await get()).status).toBe(500);
  });
});
