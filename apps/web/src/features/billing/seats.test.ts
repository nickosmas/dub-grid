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

  it("bills an inactive person while their role can manage, and only then", () => {
    const employees = [
      { status: "inactive", archived_at: null, user_id: "u-admin" },
      { status: "inactive", archived_at: null, user_id: "u-owner" },
      { status: "inactive", archived_at: null, user_id: "u-user" },
      { status: "inactive", archived_at: null, user_id: null },
    ];
    const memberships = [
      { user_id: "u-admin", org_role: "admin" },
      { user_id: "u-owner", org_role: "super_admin" },
      { user_id: "u-user", org_role: "user" },
    ];
    expect(countBillableSeats(employees, memberships)).toBe(2);
  });

  it("bills an active Admin once, not again for their role", () => {
    expect(countBillableSeats([active("u1")], [{ user_id: "u1", org_role: "admin" }])).toBe(1);
  });

  it("never bills an inactive internal Admin", () => {
    const employees = [{ status: "inactive", archived_at: null, user_id: "qa-admin" }];
    const memberships = [{ user_id: "qa-admin", org_role: "admin" }];
    expect(countBillableSeats(employees, memberships, new Set(["qa-admin"]))).toBe(0);
  });

  it("bills a management-only member once", () => {
    expect(
      countBillableSeats([active("u1")], [{ user_id: "u1" }, { user_id: "m1" }, { user_id: "m1" }]),
    ).toBe(2);
  });

  it("ignores memberships without a user", () => {
    expect(countBillableSeats([], [{ user_id: null }])).toBe(0);
  });

  it("never bills an internal account, as staff or as a member", () => {
    const internal = new Set(["qa-staff", "qa-manager"]);
    const employees = [active("u1"), active("qa-staff")];
    const memberships = [{ user_id: "u1" }, { user_id: "qa-staff" }, { user_id: "qa-manager" }];
    expect(countBillableSeats(employees, memberships)).toBe(3);
    expect(countBillableSeats(employees, memberships, internal)).toBe(1);
  });

  it("still bills staff with no account when internal accounts are listed", () => {
    expect(countBillableSeats([active(), active()], [], new Set(["qa-staff"]))).toBe(2);
  });
});
