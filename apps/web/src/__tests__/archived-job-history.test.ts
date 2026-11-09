import { describe, expect, it } from "vitest";
import {
  buildAssignableShiftDisplayMap,
  buildScheduleAssignmentOptions,
} from "@/lib/assignable-shifts";
import { addsJobKeptOnlyWhereHeld, jobIdIsArchived } from "@/lib/archived-jobs";
import { buildPublishedSegmentDetails } from "@/lib/published-shifts";
import {
  buildShiftJobPairKey,
  createAssignmentDefinitionIdByPairMap,
  createShiftJobCompatibilityMaps,
  resolveShiftJobSegments,
} from "@/lib/shift-job-segments";
import type { FocusArea, JobDefinition, ScheduleCellInput, ShiftCategory } from "@/types";

const ORG = "org-1";
const ARCHIVED_AT = "2026-11-01T00:00:00Z";

const focusAreas: FocusArea[] = [
  { id: 1, orgId: ORG, departmentId: null, name: "Acute Care", sortOrder: 0 },
];

const shiftCategories: ShiftCategory[] = [
  {
    id: 10,
    orgId: ORG,
    name: "Night Shift",
    abbr: "N",
    startTime: "19:00",
    endTime: "07:00",
    sortOrder: 0,
    focusAreaId: 1,
  },
];

function job(id: number, name: string, extra: Partial<JobDefinition> = {}): JobDefinition {
  return {
    id,
    orgId: ORG,
    name,
    abbr: name.slice(0, 3).toUpperCase(),
    showOnGrid: true,
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "#DBEAFE",
    border: "#93C5FD",
    text: "#1E40AF",
    sortOrder: id,
    systemKey: null,
    ...extra,
  };
}

const staff = job(35, "Staff", { archivedAt: ARCHIVED_AT });
const office = job(36, "Office", {
  archivedAt: ARCHIVED_AT,
  assignmentMode: "shiftless",
  defaultDurationHours: 8,
});
const charge = job(37, "Charge");
const jobs = [staff, office, charge];

const allAssignments = buildScheduleAssignmentOptions({
  orgId: ORG,
  focusAreas,
  shiftCategories,
  jobs,
  includeArchived: true,
});
const archivedNight = allAssignments.find(
  (option) => option.shiftId === 10 && option.jobId === 35,
)!;
const archivedOffice = allAssignments.find(
  (option) => option.shiftId == null && option.jobId === 36,
)!;

describe("a cell that holds an archived job", () => {
  it("has archived assignments to resolve against", () => {
    expect(archivedNight.archivedAt).toBe(ARCHIVED_AT);
    expect(archivedOffice.archivedAt).toBe(ARCHIVED_AT);
  });

  it("is named in the grid's label map, not shown as ?", () => {
    const labels = buildAssignableShiftDisplayMap({
      assignments: allAssignments,
      shiftCategories,
      jobs,
      focusAreas,
      shiftDisplayMode: "code",
    });
    expect(labels.get(archivedNight.id)).toBeTruthy();
    expect(labels.get(archivedOffice.id)).toBeTruthy();
  });

  it("resolves its stored pair to the archived assignment's id", () => {
    const idByPair = createAssignmentDefinitionIdByPairMap(allAssignments);
    expect(idByPair.get(buildShiftJobPairKey(10, 35))).toBe(archivedNight.id);
    expect(idByPair.get(buildShiftJobPairKey(null, 36))).toBe(archivedOffice.id);
    expect(
      createAssignmentDefinitionIdByPairMap(allAssignments, { includeArchived: false }).has(
        buildShiftJobPairKey(10, 35),
      ),
    ).toBe(false);
  });

  it("prefers an active assignment for the same pair", () => {
    const active = { ...archivedNight, id: 999, archivedAt: null };
    expect(
      createAssignmentDefinitionIdByPairMap([archivedNight, active]).get(
        buildShiftJobPairKey(10, 35),
      ),
    ).toBe(999);
    expect(
      createAssignmentDefinitionIdByPairMap([active, archivedNight]).get(
        buildShiftJobPairKey(10, 35),
      ),
    ).toBe(999);
  });

  it("keeps its assignment, color and times when the segment is resolved", () => {
    const maps = createShiftJobCompatibilityMaps({
      assignments: allAssignments,
      shiftCategories,
      jobs,
    });
    const [segment] = resolveShiftJobSegments({ shiftIds: [10], jobIds: [35] }, maps);
    expect(segment).toMatchObject({
      assignmentId: archivedNight.id,
      startTime: "19:00",
      endTime: "07:00",
    });
    expect(maps.assignmentByPair.get(buildShiftJobPairKey(null, 36))?.id).toBe(archivedOffice.id);
  });

  it("keeps its hours and times in published output (calendar feed, CSV)", () => {
    const details = buildPublishedSegmentDetails({ focusAreas, shiftCategories, jobs });
    expect(details.get(buildShiftJobPairKey(10, 35))).toMatchObject({
      startTime: "19:00",
      endTime: "07:00",
      durationHours: 12,
    });
    expect(details.get(buildShiftJobPairKey(null, 36))).toMatchObject({ durationHours: 8 });
  });
});

describe("new work with an archived job", () => {
  const archived = jobIdIsArchived(jobs);
  const worked = (
    segments: Array<{ shiftId: number | null; jobId: number }>,
  ): ScheduleCellInput => ({
    kind: "worked",
    segments: segments.map((segment, position) => ({ ...segment, position })),
    absenceTypeId: null,
    customStartTime: null,
    customEndTime: null,
    seriesId: null,
    fromRecurring: false,
  });

  it("tells archived jobs apart by id", () => {
    expect(archived(35)).toBe(true);
    expect(archived(37)).toBe(false);
    expect(archived(null)).toBe(false);
    expect(archived(404)).toBe(false);
  });

  it("is refused on a cell that doesn't hold it", () => {
    expect(addsJobKeptOnlyWhereHeld(worked([{ shiftId: 10, jobId: 35 }]), [], archived)).toBe(true);
    expect(
      addsJobKeptOnlyWhereHeld(
        worked([{ shiftId: 10, jobId: 35 }]),
        [{ shiftId: null, jobId: 35 }],
        archived,
      ),
    ).toBe(true);
  });

  it("is kept on a cell that already holds it", () => {
    expect(
      addsJobKeptOnlyWhereHeld(
        worked([{ shiftId: 10, jobId: 35 }]),
        [{ shiftId: 10, jobId: 35 }],
        archived,
      ),
    ).toBe(false);
  });

  it("leaves active jobs and absences alone", () => {
    expect(addsJobKeptOnlyWhereHeld(worked([{ shiftId: 10, jobId: 37 }]), [], archived)).toBe(
      false,
    );
    expect(
      addsJobKeptOnlyWhereHeld({ ...worked([]), kind: "absence", absenceTypeId: 4 }, [], archived),
    ).toBe(false);
  });
});
