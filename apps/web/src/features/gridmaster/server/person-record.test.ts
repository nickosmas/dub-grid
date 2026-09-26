import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readLoginLock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  readLoginLock: (email: string) => readLoginLock(email),
}));

import { buildPersonRecordForStaff, buildPersonRecordForUser } from "./person-record";

type Row = Record<string, unknown>;

/**
 * A query builder over fixture rows that honours `select`, so a column the
 * builder does not ask for (a token, an IP) never reaches the record.
 */
function query(rows: Row[]) {
  let current = rows;
  let columns: string[] | null = null;
  const pick = (row: Row) =>
    columns
      ? Object.fromEntries(
          columns.map((column) => {
            // An embed such as `organizations!inner(workspace_kind)` reads its fixture key.
            const key = column.split(/[!(]/)[0];
            return [key, row[key]];
          }),
        )
      : row;
  const builder = {
    select(list: string) {
      columns = list.split(/,(?![^(]*\))/).map((column) => column.trim());
      return builder;
    },
    eq(column: string, value: unknown) {
      current = current.filter((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      current = current.filter((row) => values.includes(row[column]));
      return builder;
    },
    is(column: string, value: unknown) {
      current = current.filter((row) => (row[column] ?? null) === value);
      return builder;
    },
    gt(column: string, value: string) {
      current = current.filter((row) => String(row[column]) > value);
      return builder;
    },
    order() {
      return builder;
    },
    limit(count: number) {
      current = current.slice(0, count);
      return builder;
    },
    maybeSingle: async () => ({ data: current[0] ? pick(current[0]) : null, error: null }),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: current.map(pick), error: null }).then(resolve, reject);
    },
  };
  return builder;
}

const USER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const GRIDMASTER = "33333333-3333-4333-8333-333333333333";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STAFF_A = "44444444-4444-4444-8444-444444444444";
const UNLINKED = "55555555-5555-4555-8555-555555555555";
const FUTURE = "2099-01-01T00:00:00.000Z";

function employee(overrides: Row): Row {
  return {
    org_id: ORG_A,
    employee_number: 7,
    first_name: "Ada",
    last_name: "Lovelace",
    employment_type: "full_time",
    status: "active",
    status_changed_at: null,
    status_note: "",
    certification_id: null,
    role_ids: [],
    seniority: 1,
    focus_area_ids: [],
    phone: "555-0100",
    email: "ada@example.com",
    contact_notes: "",
    archived_at: null,
    user_id: USER,
    department_ids: [3],
    dept_admin_ids: [],
    version: 4,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: ADMIN,
    updated_by: ADMIN,
    updated_at: "2026-02-01T00:00:00.000Z",
    organizations: { workspace_kind: "real" },
    ...overrides,
  };
}

function invitation(overrides: Row): Row {
  return {
    org_id: ORG_A,
    invited_by: ADMIN,
    email: "ada@example.com",
    role_to_assign: "user",
    token: "secret-invitation-token",
    expires_at: FUTURE,
    accepted_at: null,
    revoked_at: null,
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: null,
    employee_id: STAFF_A,
    first_name: "Ada",
    last_name: "Lovelace",
    phone: null,
    department_ids: [],
    dept_admin_ids: [],
    ...overrides,
  };
}

function fixtures(): Record<string, Row[]> {
  return {
    profiles: [
      {
        id: USER,
        platform_role: "none",
        first_name: "Ada",
        last_name: "Lovelace",
        mfa_enabled: true,
        terms_version: "2026-05",
        terms_accepted_at: "2026-01-03T00:00:00.000Z",
        scheduled_deletion_at: null,
        deactivation_warned_at: null,
        deactivated_at: null,
        deactivated_by: null,
        terminated_at: null,
        terminated_by: null,
        terminated_reason: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-03T00:00:00.000Z",
      },
      { id: GRIDMASTER, platform_role: "gridmaster" },
    ],
    terms_acceptances: [
      {
        user_id: USER,
        terms_version: "2026-05",
        accepted_at: "2026-01-03T00:00:00.000Z",
        ip_address: "203.0.113.9",
        user_agent: "Mobile Safari",
      },
    ],
    cookie_consents: [
      {
        user_id: USER,
        ip_hash: "abc123hash",
        consent: { essential: true, analytics: false },
        consent_version: "1",
        created_at: "2026-01-03T00:00:00.000Z",
        user_agent: "Chrome",
      },
    ],
    impersonation_sessions: [
      {
        gridmaster_id: GRIDMASTER,
        target_user_id: USER,
        target_org_id: ORG_A,
        ip_address: "198.51.100.4",
        created_at: "2026-09-26T10:00:00.000Z",
        expires_at: FUTURE,
        ended_at: null,
      },
    ],
    organization_memberships: [
      {
        id: "m-a",
        user_id: USER,
        org_id: ORG_A,
        org_role: "admin",
        admin_permissions: { canManageEmployees: true },
        joined_at: "2026-01-03T00:00:00.000Z",
        schedule_last_viewed_at: "2026-09-20T00:00:00.000Z",
        archived_at: null,
        archived_by: null,
        department_ids: [3],
        dept_admin_ids: [3],
        phone: null,
        onboarding_completed_at: "2026-01-04T00:00:00.000Z",
        tooltip_tours_completed: { schedule: true },
        updated_at: "2026-01-04T00:00:00.000Z",
      },
      {
        id: "m-b",
        user_id: USER,
        org_id: ORG_B,
        org_role: "user",
        admin_permissions: null,
        joined_at: "2025-06-01T00:00:00.000Z",
        schedule_last_viewed_at: null,
        archived_at: "2026-03-01T00:00:00.000Z",
        archived_by: ADMIN,
        department_ids: [],
        dept_admin_ids: [],
        phone: null,
        onboarding_completed_at: null,
        tooltip_tours_completed: {},
        updated_at: "2026-03-01T00:00:00.000Z",
      },
    ],
    employees: [
      employee({ id: STAFF_A }),
      employee({
        id: UNLINKED,
        org_id: ORG_B,
        user_id: null,
        first_name: "Grace",
        email: "grace@example.com",
      }),
    ],
    invitations: [
      invitation({ id: "inv-accepted", accepted_at: "2026-01-03T00:00:00.000Z" }),
      invitation({
        id: "inv-revoked",
        revoked_at: "2025-12-20T00:00:00.000Z",
        created_at: "2025-12-19T00:00:00.000Z",
      }),
      invitation({
        id: "inv-expired",
        org_id: ORG_B,
        employee_id: null,
        expires_at: "2025-06-04T00:00:00.000Z",
        created_at: "2025-06-01T00:00:00.000Z",
      }),
      invitation({
        id: "inv-grace",
        org_id: ORG_B,
        email: "grace@example.com",
        employee_id: UNLINKED,
      }),
    ],
    organizations: [
      {
        id: ORG_A,
        name: "Calm Haven",
        slug: "calmhaven",
        department_label: "Units",
        focus_area_label: "Wings",
        role_label: null,
        certification_label: null,
      },
      { id: ORG_B, name: "Birch Court", slug: "birch" },
    ],
    departments: [
      { id: 3, org_id: ORG_A, name: "Nursing" },
      { id: 4, org_id: ORG_B, name: "Kitchen" },
    ],
    focus_areas: [{ id: 5, org_id: ORG_A, name: "East Wing" }],
    organization_roles: [{ id: 8, org_id: ORG_A, name: "Charge" }],
    certifications: [{ id: 2, org_id: ORG_B, name: "RN" }],
  };
}

const AUTH_USERS: Record<string, Row> = {
  [USER]: {
    id: USER,
    email: "ada@example.com",
    created_at: "2026-01-01T00:00:00.000Z",
    last_sign_in_at: "2026-09-25T08:00:00.000Z",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  },
  [ADMIN]: { id: ADMIN, email: "admin@example.com" },
  [GRIDMASTER]: { id: GRIDMASTER, email: "gm@dubgrid.com" },
};

function fakeClient(tables = fixtures(), authError: unknown = null) {
  return {
    from: (table: string) => query(tables[table] ?? []),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: authError ? null : (AUTH_USERS[id] ?? null) },
          error: authError ?? (AUTH_USERS[id] ? null : { message: "User not found", status: 404 }),
        }),
      },
    },
  } as unknown as SupabaseClient;
}

describe("buildPersonRecordForUser", () => {
  beforeEach(() => {
    readLoginLock.mockResolvedValue({ locked: true, resetsAt: "2026-09-26T12:15:00.000Z" });
  });

  it("gathers the account, profile, consent and every organization", async () => {
    const person = await buildPersonRecordForUser(fakeClient(), USER);

    expect(person?.account).toEqual({
      userId: USER,
      email: "ada@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastSignInAt: "2026-09-25T08:00:00.000Z",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(person?.profile).toMatchObject({ firstName: "Ada", mfaEnabled: true });
    expect(person?.termsAcceptances).toEqual([
      { version: "2026-05", acceptedAt: "2026-01-03T00:00:00.000Z", userAgent: "Mobile Safari" },
    ]);
    expect(person?.cookieConsents[0]).toMatchObject({ version: "1", userAgent: "Chrome" });
    expect(person?.liveImpersonation).toEqual({
      gridmasterId: GRIDMASTER,
      orgId: ORG_A,
      startedAt: "2026-09-26T10:00:00.000Z",
      expiresAt: FUTURE,
    });
    expect(person?.loginLock).toEqual({ locked: true, resetsAt: "2026-09-26T12:15:00.000Z" });
    expect(readLoginLock).toHaveBeenCalledWith("ada@example.com");
    expect(person?.organizations.map((organization) => organization.org.name)).toEqual([
      "Birch Court",
      "Calm Haven",
    ]);
  });

  it("keeps archived memberships and every invitation state", async () => {
    const person = await buildPersonRecordForUser(fakeClient(), USER);
    const birch = person?.organizations.find((organization) => organization.org.id === ORG_B);
    const calm = person?.organizations.find((organization) => organization.org.id === ORG_A);

    expect(birch?.membership).toMatchObject({
      archivedAt: "2026-03-01T00:00:00.000Z",
      archivedBy: ADMIN,
    });
    expect(birch?.invitations.map((entry) => entry.id)).toEqual(["inv-expired"]);
    expect(calm?.invitations.map((entry) => entry.id)).toEqual(["inv-accepted", "inv-revoked"]);
    expect(calm?.employees[0]).toMatchObject({
      id: STAFF_A,
      createdBy: ADMIN,
      updatedBy: ADMIN,
      updatedAt: "2026-02-01T00:00:00.000Z",
      version: 4,
    });
    expect(calm?.membership?.tooltipToursCompleted).toEqual({ schedule: true });
  });

  it("carries each organization's own labels and names", async () => {
    const person = await buildPersonRecordForUser(fakeClient(), USER);
    const calm = person?.organizations.find((organization) => organization.org.id === ORG_A);
    const birch = person?.organizations.find((organization) => organization.org.id === ORG_B);

    expect(calm?.terminology).toEqual({
      focusAreaLabel: "Wings",
      certificationLabel: "Certifications",
      roleLabel: "Roles",
      departmentLabel: "Units",
    });
    expect(calm?.names).toEqual({
      departments: { 3: "Nursing" },
      focusAreas: { 5: "East Wing" },
      roles: { 8: "Charge" },
      certifications: {},
    });
    expect(birch?.names.departments).toEqual({ 4: "Kitchen" });
    expect(birch?.names.certifications).toEqual({ 2: "RN" });
  });

  it("resolves actors to emails", async () => {
    const person = await buildPersonRecordForUser(fakeClient(), USER);
    expect(person?.actors).toEqual({
      [ADMIN]: "admin@example.com",
      [GRIDMASTER]: "gm@dubgrid.com",
    });
  });

  it("never carries a token, an IP address or an IP hash", async () => {
    const serialized = JSON.stringify(await buildPersonRecordForUser(fakeClient(), USER));
    expect(serialized).not.toContain("secret-invitation-token");
    expect(serialized).not.toContain("203.0.113.9");
    expect(serialized).not.toContain("198.51.100.4");
    expect(serialized).not.toContain("abc123hash");
  });

  it("refuses a Gridmaster and an unknown account", async () => {
    expect(await buildPersonRecordForUser(fakeClient(), GRIDMASTER)).toBeNull();
    expect(
      await buildPersonRecordForUser(fakeClient(), "99999999-9999-4999-8999-999999999999"),
    ).toBeNull();
  });

  it("fails rather than reading an Auth outage as no account", async () => {
    await expect(
      buildPersonRecordForUser(fakeClient(fixtures(), { message: "timeout", status: 504 }), USER),
    ).rejects.toMatchObject({ status: 504 });
  });

  it("omits an ended impersonation", async () => {
    const tables = fixtures();
    tables.impersonation_sessions[0].ended_at = "2026-09-26T10:05:00.000Z";
    const person = await buildPersonRecordForUser(fakeClient(tables), USER);
    expect(person?.liveImpersonation).toBeNull();
  });
});

describe("buildPersonRecordForStaff", () => {
  it("returns an unlinked record with its invitations and no account", async () => {
    const person = await buildPersonRecordForStaff(fakeClient(), UNLINKED);

    expect(person?.account).toBeNull();
    expect(person?.profile).toBeNull();
    expect(person?.loginLock).toBeNull();
    expect(person?.organizations).toHaveLength(1);
    expect(person?.organizations[0]).toMatchObject({ org: { id: ORG_B }, membership: null });
    expect(person?.organizations[0].employees[0]).toMatchObject({ firstName: "Grace" });
    expect(person?.organizations[0].invitations.map((entry) => entry.id)).toEqual(["inv-grace"]);
  });

  it("resolves a linked record to its account", async () => {
    const person = await buildPersonRecordForStaff(fakeClient(), STAFF_A);
    expect(person?.account?.userId).toBe(USER);
  });

  it("returns null for a Test Sandbox clone", async () => {
    const tables = fixtures();
    tables.employees[1].organizations = { workspace_kind: "sandbox" };
    expect(await buildPersonRecordForStaff(fakeClient(tables), UNLINKED)).toBeNull();
  });

  it("returns null for an unknown record", async () => {
    expect(
      await buildPersonRecordForStaff(fakeClient(), "99999999-9999-4999-8999-999999999999"),
    ).toBeNull();
  });
});
