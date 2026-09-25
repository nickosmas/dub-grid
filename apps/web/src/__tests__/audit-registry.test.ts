import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AUDIT_CATEGORY_LABELS,
  AUDIT_CATEGORY_OPTIONS,
  describeAuditAction,
  getAuditCategoryLabel,
  getAuditCategoryOptions,
  getResourceTypeLabel,
  isVisibleToAudience,
  ORG_ACTIVITY_CATEGORIES,
  ORG_AUDIENCE_ACTIONS,
  ORG_AUDIENCE_CATEGORIES,
  PERSON_ACTIVITY_CATEGORIES,
} from "@/lib/audit/registry";
import { AuditDetails } from "@/lib/audit/details";
import { describeAction, formatDetails, summarizeDetails } from "@/lib/activity-log-utils";

const SRC_ROOT = path.resolve(__dirname, "..");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Every action string the app actually writes to `audit_log`. Discovered from
 * source rather than a hand-maintained list, because a hand-maintained list is
 * exactly what drifted before: four partial tables, none of them complete.
 */
function writtenAuditActions(): Map<string, string> {
  // action -> first file it was found in, for a useful failure message.
  const found = new Map<string, string>();

  // `logAudit("employee.created", …)` and `action: "employee.created"`.
  const patterns = [
    /logAudit\(\s*"([a-z0-9_]+\.[a-z0-9_]+)"/g,
    /\baction:\s*"([a-z0-9_]+\.[a-z0-9_]+)"/g,
  ];

  for (const file of sourceFiles(SRC_ROOT)) {
    const contents = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(contents)) !== null) {
        const action = match[1];
        if (!found.has(action)) found.set(action, path.relative(SRC_ROOT, file));
      }
    }
  }
  return found;
}

/** The declared union in `lib/audit.ts`, which the client writer is typed on. */
function declaredAuditActions(): string[] {
  const contents = readFileSync(path.join(SRC_ROOT, "lib", "audit.ts"), "utf8");
  const start = contents.indexOf("export type AuditAction");
  const end = contents.indexOf("export type AuditResourceType");
  return [...contents.slice(start, end).matchAll(/"([a-z0-9_]+\.[a-z0-9_]+)"/g)].map((m) => m[1]);
}

/**
 * Security events are written as `action: input.event`, so the source scanner
 * above cannot see them; their names live in the `SecurityEventName` union.
 */
function declaredSecurityEvents(): string[] {
  const source = readFileSync(path.join(SRC_ROOT, "lib/auth/security-audit.ts"), "utf8");
  return [...source.matchAll(/"(security\.[a-z0-9_.]+)"/g)].map((match) => match[1]);
}

/** Rows a database trigger writes, so no TypeScript call site names them. */
const TRIGGER_WRITTEN_ACTIONS = [
  // supabase/migrations/010_invitation_auto_revoke_audit.sql
  "invitation.auto_revoked",
];

describe("audit action registry coverage", () => {
  it("has a spec for every security event the auth layer records", () => {
    const events = declaredSecurityEvents();
    expect(events.length).toBeGreaterThanOrEqual(4);
    for (const event of events) {
      expect(AUDIT_ACTIONS, `missing spec for ${event}`).toHaveProperty(event);
    }
  });

  it("has a spec for every action a database trigger writes", () => {
    for (const action of TRIGGER_WRITTEN_ACTIONS) {
      expect(AUDIT_ACTIONS, `missing spec for ${action}`).toHaveProperty(action);
    }
  });

  it("has a spec for every action in the AuditAction union", () => {
    const missing = declaredAuditActions().filter((action) => !(action in AUDIT_ACTIONS));
    expect(missing).toEqual([]);
  });

  it("has a spec for every action the app writes", () => {
    const written = writtenAuditActions();

    // `action:` also matches unrelated object literals (Stripe events, request
    // bodies). Only hold the registry to strings that reach an audit insert.
    const auditActionShape = /^[a-z0-9_]+\.[a-z0-9_]+$/;
    const nonAudit = new Set([
      // Stripe webhook event names, matched by the generic `action:` pattern.
      "customer.subscription",
    ]);

    const candidates = [...written.entries()].filter(
      ([action]) => auditActionShape.test(action) && !nonAudit.has(action),
    );

    // Guard against the scan silently finding nothing and passing vacuously.
    expect(candidates.length).toBeGreaterThan(60);

    const missing = candidates
      .filter(([action]) => !(action in AUDIT_ACTIONS))
      .map(([action, file]) => `${action} (written in ${file})`);

    expect(missing).toEqual([]);
  });

  it("puts every action in a real category, so no filter can hide it", () => {
    for (const [action, spec] of Object.entries(AUDIT_ACTIONS)) {
      expect(
        AUDIT_CATEGORY_LABELS[spec.category],
        `${action} has an unknown category`,
      ).toBeTruthy();
      expect(getAuditCategoryLabel(action)).not.toBe("Other");
    }
  });

  it("gives every category at least one action to filter on", () => {
    for (const option of AUDIT_CATEGORY_OPTIONS) {
      if (option.value === "all") continue;
      expect(option.prefixes.length, `${option.label} matches no actions`).toBeGreaterThan(0);
    }
  });
});

describe("audit copy never leaks implementation detail", () => {
  const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

  /**
   * Payload shapes that have actually reached the render path and broken it:
   * a nested snapshot, a list of objects, a raw id, and the JS non-values.
   */
  const ADVERSARIAL_DETAILS: Record<string, unknown> = {
    input: {
      kind: "worked",
      segments: [
        { shiftId: 4, jobId: 9, position: 0 },
        { shiftId: 5, jobId: 2, position: 1 },
      ],
      customStartTime: "07:00:00",
      customEndTime: "19:00:00",
      absenceTypeId: null,
    },
    changes: [{ field: "timeZone", label: "Time zone", from: "UTC", to: "America/Chicago" }],
    nested: { deeper: { deeperStill: { value: "hidden" } } },
    listOfObjects: [{ a: 1 }, { b: 2 }],
    targetUserId: UUID,
    resourceId: UUID,
    someUuid: UUID,
    brokenNumber: Number.NaN,
    infinite: Number.POSITIVE_INFINITY,
    emptyString: "",
    nullish: null,
    undef: undefined,
    createdAt: "2026-05-04T15:00:00.000Z",
    startDate: "2026-05-04",
    created: 3,
    updated: 0,
    archived: 1,
    count: 2,
    rowCount: 120,
    occurrences: 14,
    shiftsAffected: 6,
    seats: 12,
    permissions: { canEditSchedule: true, canManagePeople: false },
    from: { timeZone: "UTC", featureFlag: false },
    to: { timeZone: "America/Chicago", featureFlag: true },
    changedFields: ["timeZone", "featureFlag"],
    summary: { newShifts: 3, modifiedShifts: 0, deletedShifts: 1, totalChanges: 4 },
  };

  const FORBIDDEN = [
    "[object Object]",
    "undefined",
    "NaN",
    "Infinity",
    "null",
    UUID,
    "_id",
    "org_id",
  ];

  function assertClean(label: string, text: string) {
    for (const needle of FORBIDDEN) {
      expect(text, `${label} leaked "${needle}": ${text}`).not.toContain(needle);
    }
    // A dotted database key rendered verbatim, e.g. "employee.created".
    expect(text, `${label} leaked a raw action key: ${text}`).not.toMatch(
      /\b[a-z0-9]+_[a-z0-9]+\.[a-z]/,
    );
  }

  for (const action of Object.keys(AUDIT_ACTIONS)) {
    it(`renders "${action}" without leaking internals`, () => {
      const entry = {
        action,
        details: ADVERSARIAL_DETAILS,
        resourceId: `${UUID}:2026-05-04`,
        resourceType: "employee",
        targetLabel: "Sarah Chen",
        targetEmail: "sarah@example.com",
        orgName: "Arden Wood",
      };

      const headline = describeAction(entry);
      expect(headline.trim().length).toBeGreaterThan(0);
      assertClean(`${action} headline`, headline);

      for (const item of formatDetails(entry)) {
        assertClean(`${action} detail label`, item.label);
        assertClean(`${action} detail value`, item.value);
      }
      assertClean(`${action} summary`, summarizeDetails(entry));
    });
  }

  it("survives an empty details blob", () => {
    for (const action of Object.keys(AUDIT_ACTIONS)) {
      const entry = { action, details: {} };
      expect(describeAction(entry).trim().length).toBeGreaterThan(0);
      expect(formatDetails(entry)).toEqual([]);
      expect(summarizeDetails(entry)).toBe("—");
    }
  });

  it("drops rather than stringifies a value it cannot name", () => {
    const rows = formatDetails({
      // No spec, so this exercises the generic flattener.
      action: "totally.unknown_action",
      details: { listOfObjects: [{ a: 1 }], deep: { a: { b: { c: 1 } } }, keep: "visible" },
    });
    expect(rows).toEqual([{ label: "Keep", value: "Visible" }]);
  });

  it("renders a change list as before/after rows using its own labels", () => {
    const rows = formatDetails({
      action: "org.updated",
      details: {
        changedFields: ["timeZone"],
        changes: [{ field: "timeZone", label: "Time zone", from: "UTC", to: "America/Chicago" }],
      },
    });
    expect(rows).toEqual([{ label: "Time zone", value: "UTC → America/Chicago" }]);
  });

  it("names every resource type without echoing the column value", () => {
    expect(getResourceTypeLabel("organization_membership")).toBe("Organization access");
    expect(getResourceTypeLabel("shift_series")).toBe("Repeating shift");
    expect(getResourceTypeLabel("")).toBe("Record");
  });
});

describe("AuditDetails accessors", () => {
  it("refuses to hand a spec a UUID as text", () => {
    const d = new AuditDetails({ name: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" });
    expect(d.text("name")).toBeNull();
  });

  it("refuses to hand a spec a non-finite number", () => {
    const d = new AuditDetails({ count: Number.NaN });
    expect(d.number("count")).toBeNull();
    expect(d.count("count")).toBe(0);
  });
});

describe("access change rows", () => {
  it("renders a permission-map change as the flags that flipped, not as Updated", () => {
    const rows = formatDetails({
      action: "organization_access.updated",
      details: {
        changes: [
          {
            field: "adminPermissions",
            label: "Admin Permissions",
            from: { canEditShifts: false, canViewReports: true, canViewStaff: true },
            to: { canEditShifts: true, canViewReports: false, canViewStaff: true },
          },
        ],
      },
    });

    expect(rows).toEqual([
      { label: "Allowed", value: "Edit shifts" },
      { label: "Not allowed", value: "View reports" },
    ]);
  });

  it("lists only what a first grant allowed", () => {
    const rows = formatDetails({
      action: "membership.updated",
      details: {
        changes: [
          {
            field: "adminPermissions",
            label: "Admin Permissions",
            from: null,
            to: { canEditShifts: true, canViewReports: false },
          },
        ],
      },
    });

    expect(rows).toEqual([{ label: "Allowed", value: "Edit shifts" }]);
  });

  it("says so when a permission edit changed nothing effective", () => {
    const rows = formatDetails({
      action: "organization_access.updated",
      details: {
        changes: [
          {
            field: "adminPermissions",
            label: "Admin Permissions",
            from: null,
            to: { canEditShifts: false },
          },
        ],
      },
    });

    expect(rows).toEqual([{ label: "Admin Permissions", value: "No effective change" }]);
  });
});

describe("audience", () => {
  const PLATFORM_ONLY = [
    "impersonation.started",
    "impersonation.ended",
    "feature_flags.updated",
    "audit.exported",
    "billing.portal_opened",
    "billing.trial_extended",
    "billing.seats_synced",
    "billing.status_overridden",
    "billing.synced",
    "gridmaster_account.promoted",
    "gridmaster_account.demoted",
    "gridmaster_account.deactivated",
    "gridmaster_account.reactivated",
    "platform_feature_flags.created",
    "platform_feature_flags.updated",
    "security.auth.login",
    "security.auth.recovery",
    "security.auth.mfa",
    "security.auth.session",
  ];

  it("keeps platform tooling out of the organization's own log", () => {
    for (const action of PLATFORM_ONLY) {
      expect(AUDIT_ACTIONS[action]?.audience, action).toBe("platform");
      expect(isVisibleToAudience(action, "org"), action).toBe(false);
      expect(isVisibleToAudience(action, "platform"), action).toBe(true);
    }
    expect(ORG_AUDIENCE_ACTIONS.some((action) => PLATFORM_ONLY.includes(action))).toBe(false);
  });

  it("keeps draft cell edits and publishes visible to an organization", () => {
    for (const action of [
      "shift.created",
      "shift.updated",
      "shift.deleted",
      "shift.moved",
      "schedule.published",
      "schedule.drafts_discarded",
      "invitation.auto_revoked",
      "billing.payment_failed",
    ]) {
      expect(isVisibleToAudience(action, "org"), action).toBe(true);
      expect(ORG_AUDIENCE_ACTIONS).toContain(action);
    }
  });

  it("names a single-device sign-out rather than a plain sign-out", () => {
    expect(describeAuditAction("security.auth.session", { scope: "device" })).toBe(
      "Signed out one of their devices",
    );
    expect(describeAuditAction("security.auth.session", {})).toBe("Signed out");
    expect(
      describeAuditAction("security.auth.session", { scope: "global", reason: "password_changed" }),
    ).toBe("Changed their password and signed out everywhere");
  });

  it("never shows an organization copy the registry did not write", () => {
    expect(isVisibleToAudience("something.new", "org")).toBe(false);
    expect(isVisibleToAudience("something.new", "platform")).toBe(true);
  });

  it("renders its own rows for every billing action an organization can read", () => {
    for (const [action, spec] of Object.entries(AUDIT_ACTIONS)) {
      if (!action.startsWith("billing.") || spec.audience === "platform") continue;
      expect(spec.details, `${action} would flatten the raw Stripe payload`).toBeTypeOf("function");
    }
  });

  it("backs every organization category with at least one org-visible action", () => {
    for (const category of ORG_AUDIENCE_CATEGORIES) {
      expect(
        ORG_AUDIENCE_ACTIONS.some((action) => AUDIT_ACTIONS[action]?.category === category),
        category,
      ).toBe(true);
    }
    expect(ORG_AUDIENCE_CATEGORIES).not.toContain("platform");
    expect(ORG_AUDIENCE_CATEGORIES).not.toContain("impersonation");
    expect(ORG_AUDIENCE_CATEGORIES).not.toContain("security");
  });

  it("keeps hashes and raw cents out of the new copy", () => {
    const hash = "a".repeat(64);
    const login = describeAction({
      action: "security.auth.login",
      details: {
        outcome: "rejected",
        reason: "invalid_credentials",
        surface: "web",
        targetHash: hash,
      },
      resourceId: null,
      resourceType: "user",
      targetLabel: null,
      targetEmail: null,
      orgName: null,
    });
    expect(login).toBe("Sign-in rejected: wrong password");
    const challenged = describeAction({
      action: "security.auth.login",
      details: { outcome: "challenged", reason: "second_factor_required", surface: "web" },
      resourceId: null,
      resourceType: "user",
      targetLabel: null,
      targetEmail: null,
      orgName: null,
    });
    expect(challenged).toBe("Sign-in awaiting two-factor code");

    const describeLogin = (details: Record<string, string>) =>
      describeAction({
        action: "security.auth.login",
        details: { surface: "web", ...details },
        resourceId: null,
        resourceType: "user",
        targetLabel: null,
        targetEmail: null,
        orgName: null,
      });
    expect(describeLogin({ outcome: "challenged", reason: "email_unconfirmed" })).toBe(
      "Sign-in awaiting email confirmation",
    );
    expect(describeLogin({ outcome: "rejected", reason: "organization_unavailable" })).toBe(
      "Sign-in rejected: organization unavailable",
    );
    expect(describeLogin({ outcome: "rejected", reason: "constructor" })).toBe("Sign-in rejected");
    expect(describeLogin({ outcome: "rejected", reason: "organization_access_denied" })).toBe(
      "Sign-in rejected: no access to this organization",
    );
    expect(describeLogin({ outcome: "rejected", reason: "gridmaster_portal_required" })).toBe(
      "Sign-in rejected: Gridmaster accounts sign in through the platform portal",
    );
    const loginRows = formatDetails({
      action: "security.auth.login",
      details: { outcome: "succeeded", reason: "accepted", surface: "mobile", targetHash: hash },
      resourceId: null,
      resourceType: "user",
      targetLabel: null,
      targetEmail: null,
      orgName: null,
    });
    expect(loginRows).toEqual([]);

    const payment = {
      action: "billing.payment_failed",
      details: {
        initiated_by: "stripe",
        stripe_event_id: "evt_123",
        stripe_event_type: "invoice.payment_failed",
        invoice_id: "in_123",
        customer_id: "cus_123",
        amount_due: 4900,
        currency: "usd",
      },
      resourceId: "in_123",
      resourceType: "billing",
      targetLabel: null,
      targetEmail: null,
      orgName: "Arden Wood",
    };
    expect(formatDetails(payment)).toEqual([{ label: "Amount", value: "$49.00" }]);
    const text = JSON.stringify(formatDetails(payment));
    expect(text).not.toContain("4900");
    expect(text).not.toContain("evt_");
    expect(text).not.toContain("Usd");

    const subscription = formatDetails({
      action: "billing.subscription_updated",
      details: {
        initiated_by: "stripe",
        stripe_event_type: "customer.subscription.updated",
        status: "active",
        previous_status: "trialing",
        quantity: 14,
        previous_quantity: 12,
        cancel_at: null,
        current_period_end: "2026-10-18T00:00:00.000Z",
      },
      resourceId: "sub_123",
      resourceType: "billing",
      targetLabel: null,
      targetEmail: null,
      orgName: "Arden Wood",
    });
    expect(subscription.map((row) => row.label)).toEqual([
      "Seats",
      "Status",
      "Current period ends",
    ]);
    expect(subscription[0]?.value).toBe("12 -> 14");
    expect(subscription[1]?.value).toBe("Trial active -> Active");
  });
});

describe("scoped category filters", () => {
  it("offers a person only the categories their activity can contain", () => {
    const options = getAuditCategoryOptions(PERSON_ACTIVITY_CATEGORIES);

    expect(options.map((option) => option.value)).toEqual([
      "all",
      "people",
      "access",
      "invitations",
    ]);
  });

  it("keeps every person category backed by actions the registry knows", () => {
    for (const category of PERSON_ACTIVITY_CATEGORIES) {
      const actions = Object.values(AUDIT_ACTIONS).filter((spec) => spec.category === category);
      expect(actions.length, category).toBeGreaterThan(0);
    }
  });

  it("drops only platform rows from an organization's filter", () => {
    const values = getAuditCategoryOptions(ORG_ACTIVITY_CATEGORIES).map((o) => o.value);

    // Platform rows are written without an org id, so an org query cannot
    // return them; impersonation carries the org it entered, so it stays.
    expect(values).not.toContain("platform");
    expect(values).toContain("impersonation");
    expect(values).toContain("billing");
    expect(values).toHaveLength(Object.keys(AUDIT_CATEGORY_LABELS).length);
  });

  it("never offers a category with no prefix to filter on", () => {
    for (const scope of [PERSON_ACTIVITY_CATEGORIES, ORG_ACTIVITY_CATEGORIES]) {
      for (const option of getAuditCategoryOptions(scope)) {
        if (option.value === "all") continue;
        expect(option.prefixes.length, option.value).toBeGreaterThan(0);
      }
    }
  });
});
