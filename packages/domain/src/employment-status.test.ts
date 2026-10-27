import { describe, expect, it } from "vitest";
import {
  EMPLOYMENT_STATUS_LABELS,
  canMarkInactive,
  describeEmploymentStatus,
  describeStatusAction,
  statusUndoAction,
} from "./employment-status";

describe("canMarkInactive", () => {
  it("allows someone with a focus area", () => {
    expect(canMarkInactive([3])).toBe(true);
  });

  it("refuses someone with no focus area, such as a management-only person", () => {
    expect(canMarkInactive([])).toBe(false);
  });
});

describe("describeEmploymentStatus", () => {
  it("names each stored status the way people see it", () => {
    expect(describeEmploymentStatus("active")).toBe("Active");
    expect(describeEmploymentStatus("inactive")).toBe("Away");
    expect(describeEmploymentStatus("removed")).toBe("Archived");
  });

  it("reads an unknown or missing status as Active", () => {
    expect(describeEmploymentStatus("benched")).toBe(EMPLOYMENT_STATUS_LABELS.active);
    expect(describeEmploymentStatus(null)).toBe("Active");
    expect(describeEmploymentStatus(undefined)).toBe("Active");
  });
});

describe("statusUndoAction", () => {
  it("brings Away back with Mark active and Archived back with Restore", () => {
    expect(statusUndoAction("inactive")).toBe("markActive");
    expect(statusUndoAction("removed")).toBe("restore");
    expect(statusUndoAction("active")).toBeNull();
  });
});

describe("describeStatusAction", () => {
  it("names the person in each title and echoes the verb in the button", () => {
    expect(describeStatusAction("markAway", "Ana Torres")).toMatchObject({
      label: "Mark away",
      title: "Mark Ana Torres away?",
      done: "Marked away",
    });
    expect(describeStatusAction("archive", "Ana Torres")).toMatchObject({
      label: "Archive",
      title: "Archive Ana Torres?",
      done: "Archived",
    });
    expect(describeStatusAction("markActive", "Ana Torres")).toMatchObject({
      label: "Mark active",
      title: "Mark Ana Torres active?",
      done: "Marked active",
    });
    expect(describeStatusAction("restore", "Ana Torres")).toMatchObject({
      label: "Restore",
      title: "Restore Ana Torres?",
      done: "Restored",
    });
  });

  it("tells the manager that Away keeps sign-in and Archive ends it", () => {
    expect(describeStatusAction("markAway", "Ana").points[0]).toBe(
      "They can still sign in and keep their role.",
    );
    expect(describeStatusAction("archive", "Ana").points[0]).toBe("They can no longer sign in.");
  });

  it("keeps the box to two or more full sentences, or none", () => {
    for (const action of ["markAway", "archive", "markActive", "restore"] as const) {
      const { points } = describeStatusAction(action, "Ana");
      // A box with one item reads oddly: a lone fact belongs in the message.
      expect(points.length === 0 || points.length >= 2).toBe(true);
      for (const point of points) expect(point).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("names the person only in the title", () => {
    for (const action of ["markAway", "archive", "markActive", "restore"] as const) {
      const copy = describeStatusAction(action, "Ana Torres");
      expect(copy.title).toContain("Ana Torres");
      expect([copy.message, ...copy.points].join(" ")).not.toContain("Ana");
    }
  });

  it("doesn't open every point with the same word", () => {
    for (const action of ["markAway", "archive"] as const) {
      const firstWords = describeStatusAction(action, "Ana").points.map((p) => p.split(" ")[0]);
      expect(new Set(firstWords).size).toBe(firstWords.length);
    }
  });

  it("adds a message only when it says more than the title", () => {
    expect(describeStatusAction("archive", "Ana").message).toBe("");
    for (const action of ["markAway", "markActive", "restore"] as const) {
      expect(describeStatusAction(action, "Ana").message).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("never names the product", () => {
    for (const action of ["markAway", "archive", "markActive", "restore"] as const) {
      const copy = describeStatusAction(action, "Ana");
      expect([copy.title, copy.message, ...copy.points].join(" ")).not.toMatch(
        /DubGrid|inactive|deactivat/i,
      );
    }
  });
});
