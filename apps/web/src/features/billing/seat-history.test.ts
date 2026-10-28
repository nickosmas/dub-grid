import { describe, expect, it } from "vitest";
import {
  buildSeatHistory,
  describeSeatHistory,
  describeSeatHistoryMonth,
  monthLabel,
  summarizePayments,
} from "./seat-history";

const now = new Date("2026-10-27T18:00:00Z");

describe("buildSeatHistory", () => {
  it("is empty until the subscription has seat history", () => {
    expect(
      buildSeatHistory([], [], {
        now,
        timeZone: "America/Los_Angeles",
        current: { paidSeats: null, seatsInUse: 12 },
      }),
    ).toEqual([]);
  });

  it("carries paid seats forward, counts in-use seats only when recorded, and reads today for this month", () => {
    const history = buildSeatHistory(
      [
        { seats: 20, billable_app_users: 20, recorded_at: "2026-08-03T17:00:00Z" },
        { seats: 22, billable_app_users: null, recorded_at: "2026-09-15T17:00:00Z" },
      ],
      [
        { kind: "paid", amount_cents: 30000, currency: "usd", occurred_at: "2026-08-03T17:00:00Z" },
        {
          kind: "failed",
          amount_cents: 33000,
          currency: "usd",
          occurred_at: "2026-09-03T17:00:00Z",
        },
        { kind: "paid", amount_cents: 33000, currency: "usd", occurred_at: "2026-09-05T17:00:00Z" },
      ],
      { now, timeZone: "America/Los_Angeles", current: { paidSeats: 22, seatsInUse: 24 } },
    );
    expect(history).toEqual([
      {
        month: "2026-08",
        paidSeats: 20,
        seatsInUse: 20,
        paidCents: 30000,
        currency: "usd",
        isCurrent: false,
      },
      {
        month: "2026-09",
        paidSeats: 22,
        seatsInUse: null,
        paidCents: 33000,
        currency: "usd",
        isCurrent: false,
      },
      {
        month: "2026-10",
        paidSeats: 22,
        seatsInUse: 24,
        paidCents: 0,
        currency: null,
        isCurrent: true,
      },
    ]);
  });

  it("puts a change in the organization's own month", () => {
    const [first] = buildSeatHistory(
      [{ seats: 5, billable_app_users: 5, recorded_at: "2026-10-01T03:00:00Z" }],
      [],
      { now, timeZone: "America/Los_Angeles", current: { paidSeats: 5, seatsInUse: 5 } },
    );
    expect(first.month).toBe("2026-09");
  });
});

describe("summarizePayments", () => {
  it("reports a failed payment only while no later payment went through", () => {
    const failed = {
      kind: "failed" as const,
      amount_cents: 45000,
      currency: "usd",
      occurred_at: "2026-10-24T17:00:00Z",
    };
    const paid = { ...failed, kind: "paid" as const, occurred_at: "2026-09-24T17:00:00Z" };
    expect(summarizePayments([paid, failed]).outstandingPayment?.occurredAt).toBe(
      failed.occurred_at,
    );
    expect(
      summarizePayments([failed, { ...paid, occurred_at: "2026-10-25T17:00:00Z" }])
        .outstandingPayment,
    ).toBeNull();
    expect(summarizePayments([]).lastPayment).toBeNull();
  });
});

describe("describeSeatHistoryMonth", () => {
  const month = {
    month: "2026-10",
    paidSeats: 30,
    seatsInUse: 32,
    paidCents: 0,
    currency: null,
    isCurrent: true,
  };

  it("says how many seats are in use, paid for, and not yet paid for", () => {
    expect(describeSeatHistoryMonth(month)).toBe(
      "32 seats are in use, and 30 seats are paid for. 2 of them aren't paid for yet.",
    );
    expect(describeSeatHistoryMonth({ ...month, seatsInUse: 29, isCurrent: false })).toBe(
      "29 seats were in use, and 30 seats were paid for. 1 paid seat wasn't in use.",
    );
    expect(describeSeatHistoryMonth({ ...month, seatsInUse: null, isCurrent: false })).toBe(
      "30 seats were paid for. Seats in use weren't counted that month.",
    );
  });

  it("sums up the months shown", () => {
    expect(
      describeSeatHistory([
        { ...month, month: "2026-08", seatsInUse: 24, isCurrent: false },
        { ...month, month: "2026-09", seatsInUse: null, isCurrent: false },
        month,
      ]),
    ).toBe(
      `Seats in use rose from 24 in ${monthLabel("2026-08", "long")} to 32 in ${monthLabel("2026-10", "long")}.`,
    );
  });
});
