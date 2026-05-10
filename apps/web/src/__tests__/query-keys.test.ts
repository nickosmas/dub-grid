import { describe, it, expect } from "vitest";
import { queryKeys } from "@/lib/query-keys";

describe("queryKeys factory", () => {
  // ── Scope existence ─────────────────────────────────────────────────────────

  describe("scope existence", () => {
    it("has org scope", () => {
      expect(queryKeys.org).toBeDefined();
    });

    it("has employees scope", () => {
      expect(queryKeys.employees).toBeDefined();
    });

    it("has shifts scope", () => {
      expect(queryKeys.shifts).toBeDefined();
    });

    it("has recurringShifts scope", () => {
      expect(queryKeys.recurringShifts).toBeDefined();
    });

    it("has shiftRequests scope", () => {
      expect(queryKeys.shiftRequests).toBeDefined();
    });

    it("has gridmaster scope", () => {
      expect(queryKeys.gridmaster).toBeDefined();
    });
  });

  // ── Tuple structure (as const produces fixed-length arrays) ────────────────

  describe("tuple structure", () => {
    it("org.all returns a 2-element tuple", () => {
      const key = queryKeys.org.all("org-1");
      expect(Array.isArray(key)).toBe(true);
      expect(key).toEqual(["org", "org-1"]);
      expect(key).toHaveLength(2);
    });

    it("employees.all returns a 2-element tuple", () => {
      const key = queryKeys.employees.all("org-1");
      expect(Array.isArray(key)).toBe(true);
      expect(key).toEqual(["employees", "org-1"]);
      expect(key).toHaveLength(2);
    });

    it("shifts.all returns a 2-element tuple", () => {
      const key = queryKeys.shifts.all("org-1");
      expect(Array.isArray(key)).toBe(true);
      expect(key).toEqual(["shifts", "org-1"]);
      expect(key).toHaveLength(2);
    });

    it("recurringShifts.all returns a 2-element tuple", () => {
      const key = queryKeys.recurringShifts.all("org-1");
      expect(Array.isArray(key)).toBe(true);
      expect(key).toEqual(["recurringShifts", "org-1"]);
      expect(key).toHaveLength(2);
    });

    it("shiftRequests.all returns a 2-element tuple", () => {
      const key = queryKeys.shiftRequests.all("org-1");
      expect(Array.isArray(key)).toBe(true);
      expect(key).toEqual(["shiftRequests", "org-1"]);
      expect(key).toHaveLength(2);
    });

    it("org.focusAreas returns a 3-element tuple", () => {
      const key = queryKeys.org.focusAreas("org-1");
      expect(key).toHaveLength(3);
      expect(key[0]).toBe("org");
    });
  });

  // ── orgId parameter inclusion ─────────────────────────────────────────────

  describe("keys include orgId parameter", () => {
    const orgId = "test-org-42";

    it("org.focusAreas includes orgId", () => {
      const key = queryKeys.org.focusAreas(orgId);
      expect(key).toContain(orgId);
    });

    it("org.assignments includes orgId", () => {
      const key = queryKeys.org.assignments(orgId);
      expect(key).toContain(orgId);
    });

    it("org.absenceTypes includes orgId", () => {
      const key = queryKeys.org.absenceTypes(orgId);
      expect(key).toContain(orgId);
    });

    it("org.coverageRequirements includes orgId", () => {
      const key = queryKeys.org.coverageRequirements(orgId);
      expect(key).toContain(orgId);
    });

    it("org.users includes orgId", () => {
      const key = queryKeys.org.users(orgId);
      expect(key).toContain(orgId);
    });

    it("org.departments includes orgId", () => {
      const key = queryKeys.org.departments(orgId);
      expect(key).toContain(orgId);
    });

    it("employees.all includes orgId", () => {
      const key = queryKeys.employees.all(orgId);
      expect(key).toContain(orgId);
    });

    it("shifts.all includes orgId", () => {
      const key = queryKeys.shifts.all(orgId);
      expect(key).toContain(orgId);
    });

    it("recurringShifts.all includes orgId", () => {
      const key = queryKeys.recurringShifts.all(orgId);
      expect(key).toContain(orgId);
    });

    it("shiftRequests.all includes orgId", () => {
      const key = queryKeys.shiftRequests.all(orgId);
      expect(key).toContain(orgId);
    });
  });

  // ── Key correctness ───────────────────────────────────────────────────────

  describe("correct key values", () => {
    it("org.focusAreas produces correct key", () => {
      expect(queryKeys.org.focusAreas("org-1")).toEqual(["org", "org-1", "focusAreas"]);
    });

    it("org.bootstrap produces correct keys", () => {
      expect(queryKeys.org.bootstrapAll()).toEqual(["org", "bootstrap"]);
      expect(queryKeys.org.bootstrap("org-1", true)).toEqual([
        "org",
        "bootstrap",
        "org-1",
        true,
      ]);
      expect(queryKeys.org.bootstrap(null, false)).toEqual([
        "org",
        "bootstrap",
        "auto",
        false,
      ]);
    });

    it("org.assignments produces correct key", () => {
      expect(queryKeys.org.assignments("org-1")).toEqual(["org", "org-1", "assignments"]);
    });

    it("org.shiftCategories produces correct key", () => {
      expect(queryKeys.org.shiftCategories("org-1")).toEqual(["org", "org-1", "shiftCategories"]);
    });

    it("org.coverageRequirements produces correct key", () => {
      expect(queryKeys.org.coverageRequirements("org-1")).toEqual([
        "org",
        "org-1",
        "coverageRequirements",
      ]);
    });

    it("org.users produces correct key", () => {
      expect(queryKeys.org.users("org-1")).toEqual(["org", "org-1", "users"]);
    });

    it("org.detail produces correct key", () => {
      expect(queryKeys.org.detail("org-1")).toEqual(["org", "org-1", "detail"]);
    });

    it("org.invitations produces correct key", () => {
      expect(queryKeys.org.invitations("org-1")).toEqual(["org", "org-1", "invitations"]);
    });

    it("employees.detail produces correct key with empId", () => {
      expect(queryKeys.employees.detail("emp-42")).toEqual([
        "employees",
        "detail",
        "emp-42",
      ]);
    });

    it("gridmaster.allOrganizations produces correct key", () => {
      expect(queryKeys.gridmaster.allOrganizations()).toEqual(["gm", "organizations"]);
    });

    it("gridmaster.allUsers produces correct key", () => {
      expect(queryKeys.gridmaster.allUsers()).toEqual(["gm", "users"]);
    });

    it("gridmaster.tenantStats produces correct key", () => {
      expect(queryKeys.gridmaster.tenantStats()).toEqual(["gm", "tenantStats"]);
    });
  });

  // ── Key uniqueness ────────────────────────────────────────────────────────

  describe("key uniqueness", () => {
    it("no two different scopes produce the same key for the same orgId", () => {
      const orgId = "org-1";

      // Collect all keys that take an orgId
      const allKeys = [
        queryKeys.org.all(orgId),
        queryKeys.org.bootstrap(orgId, true),
        queryKeys.org.detail(orgId),
        queryKeys.org.focusAreas(orgId),
        queryKeys.org.assignments(orgId),
        queryKeys.org.absenceTypes(orgId),
        queryKeys.org.shiftCategories(orgId),
        queryKeys.org.indicatorTypes(orgId),
        queryKeys.org.certifications(orgId),
        queryKeys.org.orgRoles(orgId),
        queryKeys.org.departments(orgId),
        queryKeys.org.coverageRequirements(orgId),
        queryKeys.org.users(orgId),
        queryKeys.org.directory(orgId),
        queryKeys.org.invitations(orgId),
        queryKeys.employees.all(orgId),
        queryKeys.shifts.all(orgId),
        queryKeys.recurringShifts.all(orgId),
        queryKeys.shiftRequests.all(orgId),
      ];

      // Serialize each key and check for duplicates
      const serialized = allKeys.map((k) => JSON.stringify(k));
      const uniqueSet = new Set(serialized);
      expect(uniqueSet.size).toBe(serialized.length);
    });

    it("gridmaster keys are unique among themselves", () => {
      const gmKeys = [
        queryKeys.gridmaster.allOrganizations(),
        queryKeys.gridmaster.allUsers(),
        queryKeys.gridmaster.tenantStats(),
      ];

      const serialized = gmKeys.map((k) => JSON.stringify(k));
      const uniqueSet = new Set(serialized);
      expect(uniqueSet.size).toBe(serialized.length);
    });

    it("same scope with different orgIds produces different keys", () => {
      const key1 = queryKeys.employees.all("org-1");
      const key2 = queryKeys.employees.all("org-2");
      expect(JSON.stringify(key1)).not.toBe(JSON.stringify(key2));
    });
  });
});
