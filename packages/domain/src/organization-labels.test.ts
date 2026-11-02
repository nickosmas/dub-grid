import { describe, expect, it } from "vitest";
import {
  ADMINISTRATIVE_TEAM_LABELS,
  DEFAULT_ORGANIZATION_LABELS,
  resolveOrganizationLabel,
  storedOrganizationLabel,
} from "./organization-labels";

describe("organization label defaults", () => {
  it("reads the product default when nothing is stored", () => {
    expect(resolveOrganizationLabel("focusArea", null)).toBe("Areas");
    expect(resolveOrganizationLabel("department", undefined)).toBe("Departments");
    expect(resolveOrganizationLabel("certification", "  ")).toBe("Certifications");
    expect(resolveOrganizationLabel("role", "")).toBe(DEFAULT_ORGANIZATION_LABELS.role);
  });

  it("reads a stored choice as it is", () => {
    expect(resolveOrganizationLabel("focusArea", "Wings")).toBe("Wings");
  });
});

describe("storing a submitted label", () => {
  it("stores nothing for a blank label", () => {
    expect(storedOrganizationLabel("focusArea", "")).toBeNull();
    expect(storedOrganizationLabel("focusArea", "   ")).toBeNull();
    expect(storedOrganizationLabel("focusArea", undefined)).toBeNull();
    expect(storedOrganizationLabel("department", null)).toBeNull();
  });

  it("stores nothing for the current default, in any case", () => {
    expect(storedOrganizationLabel("focusArea", "Areas")).toBeNull();
    expect(storedOrganizationLabel("focusArea", " areas ")).toBeNull();
    expect(storedOrganizationLabel("department", "Departments")).toBeNull();
    expect(storedOrganizationLabel("certification", "Certifications")).toBeNull();
    expect(storedOrganizationLabel("role", "ROLES")).toBeNull();
  });

  it("keeps a custom label, trimmed", () => {
    expect(storedOrganizationLabel("focusArea", "  Wings ")).toBe("Wings");
    expect(storedOrganizationLabel("certification", "Training")).toBe("Training");
  });

  it("keeps an earlier default someone types on purpose", () => {
    expect(storedOrganizationLabel("focusArea", "Focus Areas")).toBe("Focus Areas");
    expect(storedOrganizationLabel("department", "Scheduled Departments")).toBe(
      "Scheduled Departments",
    );
  });
});

describe("administrative team labels", () => {
  it("spells the name out in every form", () => {
    expect(ADMINISTRATIVE_TEAM_LABELS).toEqual({
      plural: "Administrative Teams",
      pluralLower: "administrative teams",
      singularLower: "administrative team",
    });
  });
});
