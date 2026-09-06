import type {
  MobileOpenShift,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";

export type ScheduleEntryLike = {
  employeeId: string;
  employeeName: string;
  employeeSeniority?: number | null;
  date: string;
  state?: MobileScheduleEntry["state"];
  presentation?: MobileScheduleEntry["presentation"];
  change?: MobileScheduleEntry["change"];
  shiftIds?: ReadonlyArray<number | null>;
  jobIds?: ReadonlyArray<number>;
  shiftLabel?: string | null;
  assignmentLabel?: string | null;
  shiftName?: string;
  absenceTypeId?: number | null;
  focusAreaId?: number | null;
  focusAreaName?: string | null;
  displayFocusAreaName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  customStartTime?: string | null;
  customEndTime?: string | null;
  segments?: ReadonlyArray<MobileScheduleEntrySegment>;
  publishedAt?: string | null;
  publishedByName?: string | null;
};

export const TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY = "all";
export const TEAM_SCHEDULE_GENERAL_SHIFTS_KEY = "general";

export type MobileScheduleRange = {
  startDate: string;
  endDate: string;
};

export type TimeRange = {
  start: string;
  end: string;
};

export type ShiftTimeSegmentLike = {
  startTime?: string | null;
  endTime?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
};

export type ShiftTimeSourceLike = {
  segments?: ReadonlyArray<ShiftTimeSegmentLike> | null;
  startTime?: string | null;
  endTime?: string | null;
  customStartTime?: string | null;
  customEndTime?: string | null;
};

export type ShiftRequestLike = {
  type: string;
  requesterShiftDate: string | null | undefined;
  requesterPresentation?: ShiftTimeSourceLike | null;
  requesterState?: Pick<ShiftTimeSourceLike, "customStartTime" | "customEndTime"> | null;
  requesterCustomStartTime?: string | null;
  requesterCustomEndTime?: string | null;
  targetShiftDate?: string | null;
  targetPresentation?: ShiftTimeSourceLike | null;
  targetState?: Pick<ShiftTimeSourceLike, "customStartTime" | "customEndTime"> | null;
  targetCustomStartTime?: string | null;
  targetCustomEndTime?: string | null;
};

export type MobileScheduleSection = {
  date: string;
  title: string;
  subtitle: string;
  entries: MobileScheduleEntry[];
};

export type MobileScheduleWeekDay = {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  isToday: boolean;
  isSelected: boolean;
};

export type MobileScheduleMonthDay = {
  date: string;
  dayLabel: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
};

export type TeamScheduleFocusAreaTab = {
  key: string;
  label: string;
  count: number;
  focusAreaId: number | null | "all" | "general";
};

export type MobileScheduleTimeGroup = {
  key: string;
  title: string;
  entries: MobileScheduleEntry[];
};

export type MobileScheduleShiftGroup = {
  key: string;
  title: string;
  entries: MobileScheduleEntry[];
};

export type MeScheduleSegmentStatus = "active" | "upcoming" | "scheduled" | "away" | "empty";

export type MeScheduleSegmentItem = {
  key: string;
  date: string;
  entry: MobileScheduleEntry;
  segment: MobileScheduleEntrySegment;
};

export type FeaturedMeScheduleSegment = {
  item: MeScheduleSegmentItem | null;
  status: MeScheduleSegmentStatus;
};

export type WeeklyHoursSummary = {
  scheduledHours: number;
  targetHours: number;
  progress: number;
  statusLabel: string;
};

export type MeShiftRequestSections = {
  coverRequests: MobileShiftRequest[];
  openShiftRequests: MobileShiftRequest[];
};

export type AvailableShiftFeedItem =
  | {
      kind: "open_shift";
      key: string;
      date: string;
      openShift: MobileOpenShift;
    }
  | {
      kind: "request";
      key: string;
      date: string;
      request: MobileShiftRequest;
    };

export type AvailableShiftDateGroup = {
  date: string;
  itemCount: number;
  slotCount: number;
  items: AvailableShiftFeedItem[];
};

export type AvailableOpenShiftFeed = {
  groups: AvailableShiftDateGroup[];
  openShiftRequests: MobileShiftRequest[];
  openShifts: MobileOpenShift[];
  totalCount: number;
};

export type LegacyMobileShiftRequest = MobileShiftRequest & {
  requesterCustomStartTime?: string | null;
  requesterCustomEndTime?: string | null;
  targetCustomStartTime?: string | null;
  targetCustomEndTime?: string | null;
};
