import { describe, expect, it } from "vitest";
import { getRoleCertificationRequirement, isRoleCertificationBlocked } from "./role-certification";

const role = { requiredCertificationIds: [2, 3] };

describe("isRoleCertificationBlocked", () => {
  it("blocks only new roles without a matching certification", () => {
    expect(
      isRoleCertificationBlocked({
        role,
        certificationId: 1,
        selectedRoleIds: [],
        roleId: 4,
      }),
    ).toBe(true);
    expect(
      isRoleCertificationBlocked({
        role,
        certificationId: 2,
        selectedRoleIds: [],
        roleId: 4,
      }),
    ).toBe(false);
  });

  it("keeps a legacy selected role removable", () => {
    expect(
      isRoleCertificationBlocked({
        role,
        certificationId: null,
        selectedRoleIds: [4],
        roleId: 4,
      }),
    ).toBe(false);
  });
});

describe("getRoleCertificationRequirement", () => {
  it("uses the organization display preference", () => {
    const input = {
      role,
      certifications: [
        { id: 2, name: "Registered Nurse", abbr: "RN" },
        { id: 3, name: "Licensed Practical Nurse", abbr: "LPN" },
      ],
      certificationLabel: "Certification",
    };

    expect(getRoleCertificationRequirement({ ...input, useCompactLabels: false })).toBe(
      "Requires Registered Nurse or Licensed Practical Nurse",
    );
    expect(getRoleCertificationRequirement({ ...input, useCompactLabels: true })).toBe(
      "Requires RN or LPN",
    );
  });
});
