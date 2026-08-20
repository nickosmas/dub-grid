import { describe, expect, it } from "vitest";
import { countStaffByCertification, summarizeStaffByCredential } from "./staff";

const staff = (...certificationIds: (number | null)[]) =>
  certificationIds.map((certificationId) => ({ certificationId, status: "active" as const }));

/** Inactive and removed rows, which no headcount should ever include. */
const offRoster = (...certificationIds: (number | null)[]) =>
  certificationIds.map((certificationId, i) => ({
    certificationId,
    status: (i % 2 === 0 ? "inactive" : "removed") as "inactive" | "removed",
  }));

describe("summarizeStaffByCredential", () => {
  it("counts staff holding a certification as certified", () => {
    expect(summarizeStaffByCredential(staff(10, 11, 10))).toEqual({ certified: 3, uncertified: 0 });
  });

  // The case the whole feature exists for: an activity coordinator holds no
  // certification, so they are never counted among the nurses.
  it("counts staff holding none as support", () => {
    expect(summarizeStaffByCredential(staff(10, null, null))).toEqual({
      certified: 1,
      uncertified: 2,
    });
  });

  it("handles an all-support roster", () => {
    expect(summarizeStaffByCredential(staff(null, null))).toEqual({ certified: 0, uncertified: 2 });
  });

  it("handles an empty roster", () => {
    expect(summarizeStaffByCredential(staff())).toEqual({ certified: 0, uncertified: 0 });
  });

  it.each([
    ["a mixed roster", staff(10, null, 11, null, 12)],
    ["every credential set", staff(10, 11)],
    ["no credential set", staff(null, null, null)],
    ["an empty roster", staff()],
  ])("certified and uncertified sum to the roster for %s", (_name, employees) => {
    const { certified, uncertified } = summarizeStaffByCredential(employees);

    expect(certified + uncertified).toBe(employees.length);
  });

  // A nurse who has left is not someone you can schedule, so no headcount here
  // may include inactive or removed rows.
  it("ignores inactive and removed staff", () => {
    expect(summarizeStaffByCredential([...staff(10, null), ...offRoster(11, 12, null)])).toEqual({
      certified: 1,
      uncertified: 1,
    });
  });
});

describe("countStaffByCertification", () => {
  const RN = { id: 10 };
  const LPN = { id: 11 };
  const CNA = { id: 12 };
  const CERTS = [RN, LPN, CNA];

  const countFor = (
    result: ReturnType<typeof countStaffByCertification>,
    id: number | "archived",
  ) => result.find((entry) => entry.certificationId === id)?.count;

  it("counts holders of each certification", () => {
    const result = countStaffByCertification(staff(RN.id, RN.id, LPN.id), CERTS);

    expect(countFor(result, RN.id)).toBe(2);
    expect(countFor(result, LPN.id)).toBe(1);
  });

  // A zero is a staffing gap, not noise — the org configured that credential
  // and nobody holds it.
  it("keeps certifications nobody holds, at zero", () => {
    const result = countStaffByCertification(staff(RN.id), CERTS);

    expect(countFor(result, CNA.id)).toBe(0);
    expect(result).toHaveLength(CERTS.length);
  });

  it("preserves the order the certifications were given in", () => {
    const result = countStaffByCertification(staff(CNA.id), CERTS);

    expect(result.map((entry) => entry.certificationId)).toEqual([RN.id, LPN.id, CNA.id]);
  });

  it("ignores support staff, who hold no certification", () => {
    const result = countStaffByCertification(staff(RN.id, null, null), CERTS);

    expect(countFor(result, RN.id)).toBe(1);
    expect(result.reduce((sum, entry) => sum + entry.count, 0)).toBe(1);
  });

  it("buckets a holder of an archived certification rather than dropping them", () => {
    const result = countStaffByCertification(staff(RN.id, 999), CERTS);

    expect(countFor(result, "archived")).toBe(1);
  });

  it("omits the archived bucket when nobody is in it", () => {
    const result = countStaffByCertification(staff(RN.id), CERTS);

    expect(countFor(result, "archived")).toBeUndefined();
  });

  it.each([
    ["a mixed roster", staff(RN.id, null, LPN.id, 999, CNA.id)],
    ["only archived references", staff(999, 998)],
    ["only support staff", staff(null, null)],
    ["an empty roster", staff()],
  ])("counts sum to the certified total for %s", (_name, employees) => {
    const total = countStaffByCertification(employees, CERTS).reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    expect(total).toBe(summarizeStaffByCredential(employees).certified);
  });

  it("ignores inactive and removed staff", () => {
    const result = countStaffByCertification([...staff(RN.id), ...offRoster(RN.id, LPN.id)], CERTS);

    expect(countFor(result, RN.id)).toBe(1);
    expect(countFor(result, LPN.id)).toBe(0);
  });

  it("returns nothing when the org has no certifications and nobody holds one", () => {
    expect(countStaffByCertification(staff(null), [])).toEqual([]);
  });
});
