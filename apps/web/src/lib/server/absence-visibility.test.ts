import { describe, expect, it, vi } from "vitest";
import { HIDDEN_ABSENCE_TYPE_ID } from "@dubgrid/domain";
import {
  hiddenAbsenceTypeFor,
  maskCellRowAbsences,
  maskPublishChangeRowAbsences,
  resolveAbsenceNameMask,
} from "./absence-visibility";

const ABSENCE_TYPES = [
  {
    id: 1,
    org_id: "org-1",
    label: "X",
    name: "Off",
    color: "#fff",
    border_color: "",
    text_color: "",
    sort_order: 0,
    archived_at: null,
  },
  {
    id: 4,
    org_id: "org-1",
    label: "S",
    name: "Sick",
    color: "#fff",
    border_color: "",
    text_color: "",
    sort_order: 1,
    archived_at: null,
  },
];

function serviceClient(coverageRuleConfig: unknown = {}) {
  const tables: Record<string, unknown> = {
    employees: { data: [{ id: "me" }], error: null },
    organizations: { data: { coverage_rule_config: coverageRuleConfig }, error: null },
    absence_types: { data: ABSENCE_TYPES, error: null },
  };
  const from = vi.fn((table: string) => {
    const result = tables[table];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () => Promise.resolve(result);
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  });
  return { from } as never as Parameters<typeof resolveAbsenceNameMask>[0] & {
    from: typeof from;
  };
}

describe("resolveAbsenceNameMask", () => {
  it("reads nothing for a viewer who sees every name", async () => {
    const client = serviceClient();
    expect(
      await resolveAbsenceNameMask(client, "org-1", { showAbsenceNames: true, userId: "u" }),
    ).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("hides a colleague's absence but keeps the viewer's own and the day off", async () => {
    const mask = await resolveAbsenceNameMask(serviceClient(), "org-1", {
      showAbsenceNames: false,
      userId: "u",
    });
    expect(mask?.absenceTypeId("colleague", 4)).toBe(HIDDEN_ABSENCE_TYPE_ID);
    expect(mask?.absenceTypeId("me", 4)).toBe(4);
    // "Off" is detected as the day off absence by its name.
    expect(mask?.absenceTypeId("colleague", 1)).toBe(1);
  });

  it("hides the detected day off too once the organization chooses no day off", async () => {
    const mask = await resolveAbsenceNameMask(
      serviceClient({ dayOffAbsenceTypeId: null }),
      "org-1",
      { showAbsenceNames: false, userId: "u" },
    );
    expect(mask?.absenceTypeId("colleague", 1)).toBe(HIDDEN_ABSENCE_TYPE_ID);
  });
});

describe("row masks", () => {
  const mask = {
    absenceTypeId: (empId: string | null | undefined, id: number | null | undefined) =>
      id == null ? null : empId === "me" ? id : HIDDEN_ABSENCE_TYPE_ID,
  };

  it("rewrites every snapshot's absence on a colleague's cell", () => {
    const row = {
      emp_id: "colleague",
      snapshots: [{ absence_type_id: 4 }, { absence_type_id: null }],
    };
    expect(maskCellRowAbsences(mask, row).snapshots).toEqual([
      { absence_type_id: HIDDEN_ABSENCE_TYPE_ID },
      { absence_type_id: null },
    ]);
    expect(maskCellRowAbsences(null, row)).toBe(row);
  });

  it("rewrites both sides of a published change, states included", () => {
    expect(
      maskPublishChangeRowAbsences(mask, {
        emp_id: "colleague",
        from_state: { kind: "absence", absenceTypeId: 4 },
        to_state: { kind: "worked", absenceTypeId: null },
        from_absence_type_id: 4,
        to_absence_type_id: null,
      }),
    ).toEqual({
      emp_id: "colleague",
      from_state: { kind: "absence", absenceTypeId: HIDDEN_ABSENCE_TYPE_ID },
      to_state: { kind: "worked", absenceTypeId: null },
      from_absence_type_id: HIDDEN_ABSENCE_TYPE_ID,
      to_absence_type_id: null,
    });
  });
});

describe("hiddenAbsenceTypeFor", () => {
  it("is an active Time off type no stored absence can share an id with", () => {
    expect(hiddenAbsenceTypeFor("org-1")).toMatchObject({
      id: HIDDEN_ABSENCE_TYPE_ID,
      orgId: "org-1",
      name: "Time off",
      archivedAt: null,
    });
  });
});
