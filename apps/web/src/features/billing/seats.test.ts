import { describe, expect, it } from "vitest";
import { countBillableSeats } from "./seats";

const active = (user_id: string | null = null) => ({
  status: "active",
  archived_at: null,
  user_id,
});

describe("countBillableSeats", () => {
  it("bills active staff, linked or not", () => {
    expect(countBillableSeats([active("u1"), active()], [{ user_id: "u1" }])).toBe(2);
  });

  it("does not bill inactive or removed staff", () => {
    const employees = [
      active(),
      { status: "inactive", archived_at: null, user_id: null },
      { status: "removed", archived_at: "2026-09-01T00:00:00Z", user_id: null },
    ];
    expect(countBillableSeats(employees, [])).toBe(1);
  });

  it("does not bill a live membership linked to an inactive or removed staff record", () => {
    const employees = [
      { status: "inactive", archived_at: null, user_id: "u-inactive" },
      { status: "removed", archived_at: "2026-09-01T00:00:00Z", user_id: "u-removed" },
    ];
    const memberships = [{ user_id: "u-inactive" }, { user_id: "u-removed" }];
    expect(countBillableSeats(employees, memberships)).toBe(0);
  });

  it("bills a management-only member once", () => {
    expect(
      countBillableSeats([active("u1")], [{ user_id: "u1" }, { user_id: "m1" }, { user_id: "m1" }]),
    ).toBe(2);
  });

  it("ignores memberships without a user", () => {
    expect(countBillableSeats([], [{ user_id: null }])).toBe(0);
  });
});
