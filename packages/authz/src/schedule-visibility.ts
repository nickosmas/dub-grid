/** The permissions that decide whether a viewer runs the schedule. */
export interface ScheduleVisibilityViewer {
  canEditShifts: boolean;
  canPublishSchedule: boolean;
  isSuperAdmin: boolean;
  isGridmaster: boolean;
}

/** The organization's choices for everyone else (item 46f); missing means shown. */
export interface ScheduleVisibilitySettings {
  staffSeeShiftChanges?: boolean | null;
  staffSeePublisher?: boolean | null;
}

export interface ScheduleVisibility {
  /** The viewer may see what each published shift changed from. */
  showChangeDetails: boolean;
  /** The viewer may see who published and who edited each cell. */
  showPublisher: boolean;
}

/**
 * What a viewer may see about a publish. Anyone who edits or publishes the
 * schedule sees everything, since the editor shows it to them anyway; the
 * organization decides for everyone else.
 */
export function scheduleViewerVisibility(
  viewer: ScheduleVisibilityViewer,
  settings: ScheduleVisibilitySettings,
): ScheduleVisibility {
  const runsSchedule =
    viewer.canEditShifts || viewer.canPublishSchedule || viewer.isSuperAdmin || viewer.isGridmaster;
  return {
    showChangeDetails: runsSchedule || settings.staffSeeShiftChanges !== false,
    showPublisher: runsSchedule || settings.staffSeePublisher !== false,
  };
}
