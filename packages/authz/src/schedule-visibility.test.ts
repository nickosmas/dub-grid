import { describe, expect, it } from "vitest";
import { scheduleViewerVisibility } from "./schedule-visibility";

const staff = {
  canEditShifts: false,
  canPublishSchedule: false,
  isSuperAdmin: false,
  isGridmaster: false,
};
const hidden = { staffSeeShiftChanges: false, staffSeePublisher: false };

describe("scheduleViewerVisibility", () => {
  it("shows staff both by default", () => {
    expect(scheduleViewerVisibility(staff, {})).toEqual({
      showChangeDetails: true,
      showPublisher: true,
    });
  });

  it("hides each one from staff when the organization turns it off", () => {
    expect(scheduleViewerVisibility(staff, hidden)).toEqual({
      showChangeDetails: false,
      showPublisher: false,
    });
    expect(scheduleViewerVisibility(staff, { staffSeePublisher: false })).toEqual({
      showChangeDetails: true,
      showPublisher: false,
    });
  });

  it.each([
    ["an editor", { canEditShifts: true }],
    ["a publisher", { canPublishSchedule: true }],
    ["a Super Admin", { isSuperAdmin: true }],
    ["a Gridmaster", { isGridmaster: true }],
  ])("always shows %s everything", (_label, grant) => {
    expect(scheduleViewerVisibility({ ...staff, ...grant }, hidden)).toEqual({
      showChangeDetails: true,
      showPublisher: true,
    });
  });
});
