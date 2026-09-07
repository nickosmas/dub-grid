import { describe, expect, it } from "vitest";
import {
  ACCESS_DEDUPE_WINDOW_MS,
  buildEmployeeActivityRows,
  diffPermissions,
  type EmployeeActivitySources,
  type EmployeeInvitationRow,
  type RoleChangeLogRow,
} from "./employee-activity";

const ORG_ID = "org-1";
const EMPLOYEE_ID = "emp-1";
const USER_ID = "user-1";
const ADMIN_ID = "admin-1";
const NOW = new Date("2026-06-01T12:00:00.000Z");

function sources(overrides: Partial<EmployeeActivitySources> = {}): EmployeeActivitySources {
  return {
    employee: {
      id: EMPLOYEE_ID,
      org_id: ORG_ID,
      user_id: USER_ID,
      created_at: "2026-01-01T09:00:00.000Z",
      created_by: ADMIN_ID,
    },
    auditRows: [],
    roleChanges: [],
    invitations: [],
    now: NOW,
    ...overrides,
  };
}

function roleChange(overrides: Partial<RoleChangeLogRow> = {}): RoleChangeLogRow {
  return {
    id: "rcl-1",
    org_id: ORG_ID,
    target_user_id: USER_ID,
    changed_by_id: ADMIN_ID,
    from_role: "user",
    to_role: "admin",
    change_type: "role_change",
    permissions_before: null,
    permissions_after: null,
    created_at: "2026-03-01T10:00:00.000Z",
    ...overrides,
  };
}

function invitation(overrides: Partial<EmployeeInvitationRow> = {}): EmployeeInvitationRow {
  return {
    id: "inv-1",
    org_id: ORG_ID,
    invited_by: ADMIN_ID,
    email: "sam@example.com",
    role_to_assign: "user",
    expires_at: "2099-01-01T00:00:00.000Z",
    accepted_at: null,
    revoked_at: null,
    created_at: "2026-02-01T10:00:00.000Z",
    ...overrides,
  };
}

function actionsOf(rows: ReturnType<typeof buildEmployeeActivityRows>) {
  return rows.map((row) => String(row.action));
}

describe("diffPermissions", () => {
  it("keeps only the keys whose value flipped", () => {
    expect(
      diffPermissions(
        { canEditSchedule: true, canManagePeople: false, canViewReports: true },
        { canEditSchedule: true, canManagePeople: true, canViewReports: false },
      ),
    ).toEqual({ canManagePeople: true, canViewReports: false });
  });

  it("treats a missing side as all-false", () => {
    expect(diffPermissions(null, { canEditSchedule: true })).toEqual({ canEditSchedule: true });
    expect(diffPermissions({ canEditSchedule: true }, null)).toEqual({ canEditSchedule: false });
  });
});

describe("buildEmployeeActivityRows", () => {
  it("turns a role ledger row into a role.changed entry with both roles", () => {
    const rows = buildEmployeeActivityRows(sources({ roleChanges: [roleChange()] }));
    const entry = rows.find((row) => row.action === "role.changed");

    expect(entry).toMatchObject({
      id: "role-change-rcl-1",
      actor_id: ADMIN_ID,
      resource_type: "organization_membership",
      resource_id: USER_ID,
      details: { fromRole: "user", toRole: "admin" },
      created_at: "2026-03-01T10:00:00.000Z",
    });
  });

  it("turns a permission ledger row into permissions.updated carrying only what changed", () => {
    const rows = buildEmployeeActivityRows(
      sources({
        roleChanges: [
          roleChange({
            change_type: "permission_change",
            from_role: "admin",
            to_role: "admin",
            permissions_before: { canEditSchedule: false, canViewReports: true },
            permissions_after: { canEditSchedule: true, canViewReports: true },
          }),
        ],
      }),
    );

    expect(rows.find((row) => row.action === "permissions.updated")?.details).toEqual({
      permissions: { canEditSchedule: true },
    });
  });

  it("maps the force-logout placeholder row to user.force_logout", () => {
    const rows = buildEmployeeActivityRows(
      sources({ roleChanges: [roleChange({ from_role: "n/a", to_role: "n/a" })] }),
    );

    expect(actionsOf(rows)).toContain("user.force_logout");
    expect(actionsOf(rows)).not.toContain("role.changed");
  });

  it("drops a ledger row the app already audited moments earlier, and keeps one it did not", () => {
    const audited = roleChange({ id: "rcl-audited", created_at: "2026-03-01T10:00:00.400Z" });
    const unaudited = roleChange({
      id: "rcl-unaudited",
      created_at: new Date(
        new Date("2026-03-01T10:00:00.000Z").getTime() + ACCESS_DEDUPE_WINDOW_MS + 1,
      ).toISOString(),
    });
    const rows = buildEmployeeActivityRows(
      sources({
        auditRows: [
          {
            id: 7,
            org_id: ORG_ID,
            actor_id: ADMIN_ID,
            action: "organization_access.updated",
            resource_type: "organization_membership",
            resource_id: USER_ID,
            details: { changes: [] },
            created_at: "2026-03-01T10:00:00.000Z",
          },
        ],
        roleChanges: [audited, unaudited],
      }),
    );

    const ids = rows.map((row) => row.id);
    expect(ids).toContain(7);
    expect(ids).toContain("role-change-rcl-unaudited");
    expect(ids).not.toContain("role-change-rcl-audited");
  });

  it("matches an access audit row by its targetUserId detail as well as its resource id", () => {
    const rows = buildEmployeeActivityRows(
      sources({
        auditRows: [
          {
            id: 8,
            org_id: ORG_ID,
            actor_id: ADMIN_ID,
            action: "role.changed",
            resource_type: "role",
            resource_id: "something-else",
            details: { targetUserId: USER_ID, toRole: "admin" },
            created_at: "2026-03-01T10:00:00.000Z",
          },
        ],
        roleChanges: [roleChange()],
      }),
    );

    expect(actionsOf(rows).filter((action) => action === "role.changed")).toHaveLength(1);
  });

  it("synthesizes the invitation lifecycle the web flow never audits", () => {
    const rows = buildEmployeeActivityRows(
      sources({
        invitations: [
          invitation({ id: "inv-accepted", accepted_at: "2026-02-02T10:00:00.000Z" }),
          invitation({ id: "inv-revoked", revoked_at: "2026-02-03T10:00:00.000Z" }),
          invitation({ id: "inv-expired", expires_at: "2026-02-04T10:00:00.000Z" }),
          invitation({ id: "inv-open" }),
        ],
      }),
    );

    expect(actionsOf(rows).filter((action) => action === "invitation.sent")).toHaveLength(4);
    expect(rows.find((row) => row.action === "invitation.accepted")).toMatchObject({
      resource_id: "inv-accepted",
      actor_id: USER_ID,
      created_at: "2026-02-02T10:00:00.000Z",
    });
    expect(rows.find((row) => row.action === "invitation.revoked")).toMatchObject({
      resource_id: "inv-revoked",
    });
    expect(rows.find((row) => row.action === "invitation.expired")).toMatchObject({
      resource_id: "inv-expired",
      created_at: "2026-02-04T10:00:00.000Z",
    });
    expect(rows.find((row) => row.action === "invitation.sent")?.details).toEqual({
      email: "sam@example.com",
      role: "user",
    });
  });

  it("does not duplicate an invitation event the app audited itself", () => {
    const rows = buildEmployeeActivityRows(
      sources({
        auditRows: [
          {
            id: 9,
            org_id: ORG_ID,
            actor_id: ADMIN_ID,
            action: "invitation.created",
            resource_type: "invitation",
            resource_id: "inv-1",
            details: { changes: [] },
            created_at: "2026-02-01T10:00:00.100Z",
          },
          {
            id: 10,
            org_id: ORG_ID,
            actor_id: ADMIN_ID,
            action: "invitation.revoked",
            resource_type: "invitation",
            resource_id: "inv-1",
            details: {},
            created_at: "2026-02-03T10:00:00.100Z",
          },
        ],
        invitations: [invitation({ revoked_at: "2026-02-03T10:00:00.000Z" })],
      }),
    );

    expect(actionsOf(rows).filter((action) => action.startsWith("invitation."))).toEqual([
      "invitation.revoked",
      "invitation.created",
    ]);
  });

  it("records when the person was added unless the app already did", () => {
    const withoutAudit = buildEmployeeActivityRows(sources());
    expect(withoutAudit.find((row) => row.action === "employee.created")).toMatchObject({
      id: `employee-added-${EMPLOYEE_ID}`,
      actor_id: ADMIN_ID,
      resource_id: EMPLOYEE_ID,
      created_at: "2026-01-01T09:00:00.000Z",
    });

    const withAudit = buildEmployeeActivityRows(
      sources({
        auditRows: [
          {
            id: 1,
            org_id: ORG_ID,
            actor_id: ADMIN_ID,
            action: "employee.created",
            resource_type: "employee",
            resource_id: EMPLOYEE_ID,
            details: {},
            created_at: "2026-01-01T09:00:00.050Z",
          },
        ],
      }),
    );
    expect(withAudit.filter((row) => row.action === "employee.created")).toHaveLength(1);
    expect(withAudit[0].id).toBe(1);
  });

  it("sorts everything newest first", () => {
    const rows = buildEmployeeActivityRows(
      sources({
        roleChanges: [roleChange({ created_at: "2026-03-01T10:00:00.000Z" })],
        invitations: [invitation({ created_at: "2026-02-01T10:00:00.000Z" })],
      }),
    );

    expect(actionsOf(rows)).toEqual(["role.changed", "invitation.sent", "employee.created"]);
  });
});
