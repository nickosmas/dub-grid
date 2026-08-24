import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AUDIT_CATEGORY_LABELS,
  AUDIT_CATEGORY_OPTIONS,
  getAuditCategoryLabel,
  getResourceTypeLabel,
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

describe("audit action registry coverage", () => {
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
