import { describe, expect, it } from "vitest";
import {
  buildDefaultSandboxJobRows,
  buildSandboxOwnerMembership,
  buildSandboxPeopleNames,
  buildSandboxSchedulePairs,
  mapSandboxJobSystemKey,
  mapSandboxShiftKeyedRecord,
} from "./server";

describe("test sandbox server helpers", () => {
  it("remaps shift-keyed job override objects to sandbox shift ids", () => {
    const result = mapSandboxShiftKeyedRecord(
      {
        "10": { startTime: "08:00", endTime: "16:00" },
        "11": "#DBEAFE",
        "999": "#FEE2E2",
        invalid: "#000000",
      },
      new Map([
        [10, 110],
        [11, 111],
      ]),
    );

    expect(result).toEqual({
      "110": { startTime: "08:00", endTime: "16:00" },
      "111": "#DBEAFE",
    });
  });

  it("seeds default visible jobs with applicable sandbox shifts", () => {
    const rows = buildDefaultSandboxJobRows({
      sandboxOrgId: "sandbox-org",
      fallbackFocusAreaId: 1,
      fallbackDepartmentId: 2,
      fallbackRoleId: 3,
      fallbackCertId: 4,
      shiftIds: [10, 11],
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.org_id === "sandbox-org")).toBe(true);
    expect(rows.every((row) => row.applicable_shift_ids === rows[0].applicable_shift_ids)).toBe(true);
    expect(rows[0].applicable_shift_ids).toEqual([10, 11]);
    expect(rows[1].applicable_shift_ids).toEqual([10, 11]);
  });

  it("preserves protected system job keys so hidden defaults do not duplicate", () => {
    expect(mapSandboxJobSystemKey("default_shift_job")).toBe("default_shift_job");
    expect(mapSandboxJobSystemKey("regular_staff")).toBe("regular_staff");
    expect(mapSandboxJobSystemKey("custom_seed_job")).toBeNull();
    expect(mapSandboxJobSystemKey(null)).toBeNull();
  });

  it("marks the sandbox owner as already onboarded", () => {
    expect(
      buildSandboxOwnerMembership({
        actorId: "user-1",
        sandboxOrgId: "sandbox-org",
        onboardingCompletedAt: "2026-05-11T12:00:00.000Z",
      }),
    ).toMatchObject({
      user_id: "user-1",
      org_id: "sandbox-org",
      org_role: "super_admin",
      onboarding_completed_at: "2026-05-11T12:00:00.000Z",
      archived_at: null,
      archived_by: null,
    });
  });

  it("uses the signed-in user's account name and then source employee names", () => {
    expect(
      buildSandboxPeopleNames({
        actorName: { firstName: "Nick", lastName: "Osmas" },
        sourcePeopleNames: [
          { firstName: "Avery", lastName: "Stone" },
          { firstName: "Nick", lastName: "Osmas" },
          { firstName: "Jordan", lastName: "Lee" },
        ],
      }),
    ).toEqual([
      { firstName: "Nick", lastName: "Osmas" },
      { firstName: "Avery", lastName: "Stone" },
      { firstName: "Jordan", lastName: "Lee" },
    ]);
  });

  it("builds seeded schedule pairs only from compatible copied shifts and jobs", () => {
    const pairs = buildSandboxSchedulePairs({
      focusAreas: [
        { id: 10, department_id: 100 },
        { id: 20, department_id: 200 },
      ],
      shifts: [
        { id: 1, focus_area_id: 10 },
        { id: 2, focus_area_id: 20 },
      ],
      jobs: [{ id: 500 }, { id: 600 }, { id: 700 }],
      jobRows: [
        {
          assignment_mode: "with_shift",
          applicable_shift_ids: [1],
          focus_area_ids: [],
          department_ids: [],
        },
        {
          assignment_mode: "with_shift",
          applicable_shift_ids: [],
          focus_area_ids: [20],
          department_ids: [],
        },
        {
          assignment_mode: "shiftless",
          applicable_shift_ids: [],
          focus_area_ids: [],
          department_ids: [],
        },
      ],
    });

    expect(pairs).toEqual([
      { shiftId: 1, jobId: 500 },
      { shiftId: 2, jobId: 600 },
    ]);
  });
});
