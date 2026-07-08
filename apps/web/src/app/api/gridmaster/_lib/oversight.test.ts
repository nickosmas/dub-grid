import { describe, expect, it } from "vitest";
import { buildPlatformActivitySummary, loadGridmasterOrgHealth } from "./oversight";

const orgId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-05-03T12:00:00.000Z");

function auditRow(action: string, offsetMinutes: number, details: Record<string, unknown> = {}) {
  return {
    id: offsetMinutes,
    org_id: orgId,
    action,
    details,
    created_at: new Date(now.getTime() - offsetMinutes * 60_000).toISOString(),
  };
}

describe("gridmaster platform activity summary", () => {
  it("classifies high-volume normal operations without raising a review signal", () => {
    const auditRows = Array.from({ length: 24 }, (_, index) =>
      auditRow(index % 2 === 0 ? "employee.benched" : "employee.activated", index + 1),
    );
    auditRows.push(auditRow("employee.created", 30, { bulkImport: true, total: 125 }));

    const summary = buildPlatformActivitySummary({
      auditRows,
      organizations: [{ id: orgId, name: "Arden Wood" }],
      now,
    });

    expect(summary.last24hCount).toBe(25);
    expect(summary.reviewRecommendedOrganizations).toEqual([]);
    expect(summary.busiestOrganizations[0]).toMatchObject({
      orgId,
      orgName: "Arden Wood",
      actionCount: 25,
      operationalActionCount: 25,
      highRiskActionCount: 0,
      classification: "normal_operation",
      reason: "Normal operational activity",
    });
  });

  it("reserves review signals for explicit high-risk audited actions", () => {
    const summary = buildPlatformActivitySummary({
      auditRows: [auditRow("employee.updated", 1), auditRow("org.suspended", 2)],
      organizations: [{ id: orgId, name: "Arden Wood" }],
      now,
    });

    expect(summary.reviewRecommendedOrganizations).toHaveLength(1);
    expect(summary.reviewRecommendedOrganizations[0]).toMatchObject({
      orgId,
      classification: "review_recommended",
      highRiskActionCount: 1,
      reason: "1 review-worthy audited action",
    });
  });
});

class MockQuery {
  constructor(private readonly rows: Record<string, unknown>[]) {}

  select() {
    return this;
  }

  gte() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  then<
    TResult1 = { data: Record<string, unknown>[]; count: number; error: null },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((value: {
          data: Record<string, unknown>[];
          count: number;
          error: null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({
      data: this.rows,
      count: this.rows.length,
      error: null,
    }).then(onfulfilled, onrejected);
  }
}

function mockServiceClient(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      return new MockQuery(tables[table] ?? []);
    },
  };
}

function organizationRow() {
  return {
    id: orgId,
    name: "Arden Wood",
    slug: "arden-wood",
    address: "",
    address_line_1: "",
    address_line_2: "",
    address_city: "",
    address_state: "",
    address_postal_code: "",
    address_country: "",
    phone: "",
    employee_count: 0,
    focus_area_label: "Focus Areas",
    certification_label: "Certifications",
    role_label: "Roles",
    department_label: "Scheduled Departments",
    shift_display_mode: "code",
    timezone: "America/Los_Angeles",
    pay_period_start_date: null,
    archived_at: null,
    suspended_at: null,
    suspended_reason: null,
    enforce_conflict_prevention: false,
    coverage_rule_config: null,
    stripe_customer_id: null,
    subscription_status: "trialing",
    trial_ends_at: null,
    subscription_seats: null,
    data_retention_days: 365,
    feature_overrides: {},
    updated_at: now.toISOString(),
  };
}

describe("gridmaster organization health facts", () => {
  it("excludes archived memberships from user and active-session counts", async () => {
    const activeUserId = "22222222-2222-4222-8222-222222222222";
    const archivedUserId = "33333333-3333-4333-8333-333333333333";
    const recentSessionAt = new Date().toISOString();

    const summaries = await loadGridmasterOrgHealth(
      mockServiceClient({
        organizations: [organizationRow()],
        organization_memberships: [
          {
            org_id: orgId,
            user_id: activeUserId,
            org_role: "user",
            joined_at: now.toISOString(),
            updated_at: now.toISOString(),
            archived_at: null,
          },
          {
            org_id: orgId,
            user_id: archivedUserId,
            org_role: "user",
            joined_at: now.toISOString(),
            updated_at: now.toISOString(),
            archived_at: now.toISOString(),
          },
        ],
        user_sessions: [
          {
            user_id: activeUserId,
            platform: "web",
            app_version: null,
            device_label: null,
            last_active_at: recentSessionAt,
            created_at: recentSessionAt,
          },
          {
            user_id: archivedUserId,
            platform: "web",
            app_version: null,
            device_label: null,
            last_active_at: recentSessionAt,
            created_at: recentSessionAt,
          },
        ],
      }),
      orgId,
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].supportSnapshot.userCount).toBe(1);
    expect(summaries[0].supportSnapshot.activeUsers30d).toBe(1);
    expect(summaries[0].supportSnapshot.activeSessions).toBe(1);
  });
});
