import { describe, expect, it } from "vitest";
import {
  ADMINISTRATIVE_TEAM_LABELS,
  DEFAULT_ORGANIZATION_LABELS,
  ORGANIZATION_LABEL_EXAMPLES,
  organizationLabelHint,
  resolveOrganizationLabel,
  storedOrganizationLabel,
} from "./organization-labels";

describe("organization label defaults", () => {
  it("reads the product default when nothing is stored", () => {
    expect(resolveOrganizationLabel("focusArea", null)).toBe("Schedule Areas");
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
    expect(storedOrganizationLabel("focusArea", "Schedule Areas")).toBeNull();
    expect(storedOrganizationLabel("focusArea", " schedule areas ")).toBeNull();
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
    expect(storedOrganizationLabel("focusArea", "Areas")).toBe("Areas");
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

describe("label example hints", () => {
  it("lists each label's examples after e.g.", () => {
    expect(organizationLabelHint("focusArea")).toBe(
      "e.g. Schedule Areas, Units, Wings, Halls, Floors, Neighborhoods, Locations",
    );
    expect(organizationLabelHint("certification")).toBe(
      "e.g. Certifications, Credentials, Licenses, Qualifications, Designations, Skill Levels, Training",
    );
    expect(organizationLabelHint("role")).toBe(
      "e.g. Roles, Positions, Responsibilities, Duties, Titles",
    );
  });

  it("starts each list with the label's default", () => {
    for (const key of Object.keys(ORGANIZATION_LABEL_EXAMPLES) as Array<
      keyof typeof ORGANIZATION_LABEL_EXAMPLES
    >) {
      expect(ORGANIZATION_LABEL_EXAMPLES[key][0]).toBe(DEFAULT_ORGANIZATION_LABELS[key]);
    }
  });
});
