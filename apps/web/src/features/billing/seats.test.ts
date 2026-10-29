import { describe, expect, it } from "vitest";
import { breakdownBillableSeats, countBillableSeats, describeSeatBreakdown } from "./seats";

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

describe("breakdownBillableSeats", () => {
  const employees = [
    { status: "active", archived_at: null, user_id: "u-active" },
    { status: "active", archived_at: null, user_id: null },
    {
      status: "inactive",
      archived_at: null,
      user_id: "u-lee",
    },
    {
      status: "inactive",
      archived_at: null,
      user_id: "u-amy",
    },
    { status: "inactive", archived_at: null, user_id: "u-away" },
    { status: "inactive", archived_at: null, user_id: null },
    { status: "removed", archived_at: "2026-09-01T00:00:00Z", user_id: "u-gone" },
    { status: "removed", archived_at: null, user_id: null },
  ];
  const memberships = [
    { user_id: "u-active", org_role: "user" },
    { user_id: "u-lee", org_role: "admin" },
    { user_id: "u-amy", org_role: "super_admin" },
    { user_id: "u-away", org_role: "user" },
    { user_id: "m-1", org_role: "admin" },
  ];

  it("splits billed and unbilled people by status", () => {
    expect(breakdownBillableSeats(employees, memberships)).toEqual({
      activeStaff: 2,
      suspended: 0,
      awayManaging: 2,
      managementOnly: 1,
      awayNotBilled: 2,
      archived: 2,
      total: 5,
    });
  });

  it("counts suspended staff apart from active staff, and still bills them", () => {
    const breakdown = breakdownBillableSeats(
      [
        {
          status: "active",
          archived_at: null,
          user_id: "u-1",
        },
        {
          status: "active",
          archived_at: null,
          suspended_at: "2026-10-26T00:00:00Z",
          user_id: "u-2",
        },
      ],
      [],
    );
    expect(breakdown).toMatchObject({
      activeStaff: 1,
      suspended: 1,
      total: 2,
    });
  });

  it("totals the same as countBillableSeats", () => {
    expect(breakdownBillableSeats(employees, memberships).total).toBe(
      countBillableSeats(employees, memberships),
    );
  });

  it("leaves internal accounts off every line", () => {
    const internal = new Set(["u-lee", "u-away", "u-gone", "m-1"]);
    expect(breakdownBillableSeats(employees, memberships, internal)).toMatchObject({
      awayManaging: 1,
      managementOnly: 0,
      awayNotBilled: 1,
      archived: 1,
      total: 3,
    });
  });

  it("counts an Away manager with no name without listing a blank", () => {
    const result = breakdownBillableSeats(
      [{ status: "inactive", archived_at: null, user_id: "u-x" }],
      [{ user_id: "u-x", org_role: "admin" }],
    );
    expect(result.awayManaging).toBe(1);
  });
});

describe("describeSeatBreakdown", () => {
  const base = {
    activeStaff: 42,
    suspended: 0,
    awayManaging: 0,
    managementOnly: 0,
    awayNotBilled: 0,
    archived: 0,
    total: 42,
  };

  const ACTIVE = {
    key: "active",
    label: "Active staff",
    count: 42,
    detail: "Everyone on staff with an Active status, whether or not they have an account.",
  };

  it("always lists active staff and leaves empty lines out", () => {
    expect(describeSeatBreakdown(base)).toEqual({ billed: [ACTIVE], notBilled: [] });
  });

  it("counts the Away people who take a seat and says why, without names", () => {
    const { billed } = describeSeatBreakdown({ ...base, awayManaging: 1, total: 43 });
    expect(billed[1]).toEqual({
      key: "away-managing",
      label: "Away Admins and Super Admins",
      count: 1,
      detail: "They keep their seat while away, since they can still sign in and manage.",
    });
  });

  it("shows suspended people as their own billed group after active staff, without names", () => {
    const { billed } = describeSeatBreakdown({ ...base, suspended: 1, total: 43 });
    expect(billed[1]).toEqual({
      key: "suspended",
      label: "Suspended staff",
      count: 1,
      detail: "People who are suspended keep their seat, even though they can't sign in.",
    });
  });

  it("lists managers without a staff record, then Away and Offboarded as not billed", () => {
    expect(
      describeSeatBreakdown({ ...base, managementOnly: 2, awayNotBilled: 2, archived: 12 }),
    ).toEqual({
      billed: [
        ACTIVE,
        {
          key: "management-only",
          label: "Members not on staff",
          count: 2,
          detail: "People who can sign in but have no staff profile.",
        },
      ],
      notBilled: [
        {
          key: "away",
          label: "Other Away staff",
          count: 2,
          detail: "They take a seat again once they're back.",
        },
        {
          key: "archived",
          label: "Offboarded staff",
          count: 12,
          detail: "People who have been offboarded never take a seat.",
        },
      ],
    });
  });
});
