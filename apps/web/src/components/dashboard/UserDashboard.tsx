import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { CalendarDays, Check, Clock3, Layers, MapPin, UserRound, Users } from "lucide-react";
import type { DashboardContentProps } from "./DashboardContentProps";
import { EmptyState } from "@/components/EmptyState";
import { formatDateKey, getAvatarInitials } from "@/lib/utils";
import { resolveShiftPillColors } from "@/lib/colors";
import { shouldShowJobOnGrid } from "@/lib/job-placement";
import {
  getCurrentTimeValueInTimeZone,
  getIsoDateInTimeZone,
  hasShiftRequestStarted,
  hasShiftStartedAtTimeRanges,
} from "@dubgrid/schedule-core";
import type { OpenShiftVisibility } from "@dubgrid/domain";
import { getAvatarTone } from "@dubgrid/design-tokens";
import { isEmployeeEligibleForOpenShift } from "@/app/schedule/_lib/open-shifts";
import type {
  AbsenceType,
  AssignmentDefinition,
  Employee,
  FocusArea,
  JobDefinition,
  ScheduleCellInput,
  ScheduleCellStateEntry,
  ShiftCategory,
  ShiftJobSegment,
  ShiftMap,
  ShiftRequest,
} from "@/types";

type DashboardScheduleSegment = {
  assignment: AssignmentDefinition | null;
  backgroundColor: string;
  borderColor: string;
  chipLabel: string;
  dateKey: string;
  endTime: string | null;
  focusAreaId: number | null;
  focusAreaName: string | null;
  isAbsence: boolean;
  isGeneral: boolean;
  isMentored: boolean;
  jobAbbr: string | null;
  jobId: number | null;
  jobName: string | null;
  shiftAbbr: string | null;
  shiftId: number | null;
  shiftName: string | null;
  sortTime: string;
  startTime: string | null;
  textColor: string;
  title: string;
  typeLabel: string | null;
};

type DashboardScheduleItem = {
  date: Date;
  dateKey: string;
  employeeId: string;
  employeeName: string;
  entry: ScheduleCellStateEntry;
  key: string;
  segment: DashboardScheduleSegment;
  segmentIndex: number;
};

type HeroStatus = "active" | "upcoming" | "scheduled" | "away" | "empty";

type HeroTiming = {
  label: string;
  progress: number | null;
};

type AvailableShiftItem =
  | {
      date: Date;
      dateKey: string;
      id: string;
      kind: "pickup";
      request: ShiftRequest;
      subtitle: string;
      timeRange: string | null;
      title: string;
    }
  | {
      assignment: AssignmentDefinition | null;
      date: Date;
      dateKey: string;
      id: string;
      kind: "coverage";
      openShift: DashboardContentProps["openShifts"][number];
      subtitle: string;
      timeRange: string | null;
      title: string;
    };

type DashboardActionItem =
  | {
      date: Date;
      dateKey: string;
      id: string;
      kind: "request";
      request: ShiftRequest;
      sortTime: string;
    }
  | {
      date: Date;
      dateKey: string;
      id: string;
      item: AvailableShiftItem;
      kind: "available-shift";
      sortTime: string;
    };

const HERO_MAX_WIDTH = 680;
// Padding lives inside the desktop scroll panes (not on the outer area) so the
// panes run edge-to-edge under the sticky header and to the bottom of the
// screen, while their scrollable content still has breathing room at the very
// top and bottom of the scroll. Scrolling slides content under the header.
const PANE_SCROLL_PADDING = 32;
// Horizontal inset inside the scroll panes so card borders/shadows clear the
// container's clipping edge (a vertical scroll container also clips the x-axis).
const PANE_SCROLL_GUTTER = 16;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Matches the mobile hero gradient (apps/mobile ScheduleScreen.tsx
// ME_HERO_CARD_GRADIENT_LIGHT/_DARK): dark mode keeps the same dark-navy
// start but ends in the app's vivid dark-mode brand blue instead of a pale
// periwinkle, which would read as a washed-out pastel blob on a near-black page.
const DASHBOARD_HERO_BG_LIGHT =
  "linear-gradient(to top right, #142579 0%, #2C49CC 55%, #6E90FF 100%)";
const DASHBOARD_HERO_BG_DARK =
  "linear-gradient(to top right, #0A1442 0%, #1D3AA0 55%, #2075FF 100%)";
// Matches the mobile hero card's "Working with" pill (ScheduleScreen.tsx
// ME_HERO_COLLABORATOR_BACKGROUND_LIGHT/_DARK) — a solid navy fill, not a
// translucent white overlay, so the pill reads as a distinct block on the gradient.
const DASHBOARD_HERO_COLLABORATOR_BG_LIGHT = "#3A55CB";
const DASHBOARD_HERO_COLLABORATOR_BG_DARK = "#1E2F66";
const DASHBOARD_HERO_AVATAR_OVERLAP = -10;

export default function UserDashboard(props: DashboardContentProps) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const {
    allShifts,
    assignmentById,
    currentEmpId,
    currentEmployee,
    currentHours,
    currentPeriodShifts,
    employees,
    focusAreas,
    isMobile,
    isTablet,
    jobs,
    openShifts,
    org,
    periodDates,
    shiftCategories,
    shiftRequests,
    absenceTypeById,
    viewMode,
  } = props;
  const isTwoWeekView = viewMode === "2weeks";
  const now = useMinuteNow();
  // "Today" and the current clock are evaluated in the organization's timezone,
  // not the viewer's browser timezone, so the hero highlights the right day and
  // detects an in-progress shift correctly for staff in other timezones.
  const timeZone = org.timezone ?? null;
  const todayKey = getIsoDateInTimeZone(now, timeZone);
  const nowMinutes = hhmmToMinutes(getCurrentTimeValueInTimeZone(now, timeZone));
  const periodStartKey = periodDates[0] ? formatDateKey(periodDates[0]) : "";
  const periodEndKey = periodDates[periodDates.length - 1]
    ? formatDateKey(periodDates[periodDates.length - 1])
    : "";
  const focusAreaById = useMemo(
    () => new Map(focusAreas.map((focusArea) => [focusArea.id, focusArea])),
    [focusAreas],
  );
  const shiftById = useMemo(
    () => new Map(shiftCategories.map((shift) => [shift.id, shift])),
    [shiftCategories],
  );
  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const allScheduleItems = useMemo(
    () =>
      buildScheduleItemsFromShiftMap({
        absenceTypeById,
        assignmentById,
        currentPeriodShifts,
        employeeById,
        focusAreaById,
        jobById,
        shiftById,
        isDarkTheme,
      }),
    [
      absenceTypeById,
      assignmentById,
      currentPeriodShifts,
      employeeById,
      focusAreaById,
      jobById,
      shiftById,
      isDarkTheme,
    ],
  );
  const myScheduleItems = useMemo(
    () => (currentEmpId ? allScheduleItems.filter((item) => item.employeeId === currentEmpId) : []),
    [allScheduleItems, currentEmpId],
  );
  // The hero highlights your current/next shift, which can fall outside the
  // period being browsed (e.g. next week). Build its candidate pool from the
  // wider, forward-looking `allShifts` window (see HERO_LOOKAHEAD_DAYS in
  // DashboardView), anchored to today, so it never falls back to a past shift.
  const upcomingAllItems = useMemo(
    () =>
      buildScheduleItemsFromShiftMap({
        absenceTypeById,
        assignmentById,
        currentPeriodShifts: allShifts,
        employeeById,
        focusAreaById,
        jobById,
        shiftById,
        isDarkTheme,
      }).filter((item) => item.dateKey >= todayKey),
    [
      absenceTypeById,
      allShifts,
      assignmentById,
      employeeById,
      focusAreaById,
      jobById,
      shiftById,
      todayKey,
      isDarkTheme,
    ],
  );
  const heroItems = useMemo(
    () => (currentEmpId ? upcomingAllItems.filter((item) => item.employeeId === currentEmpId) : []),
    [upcomingAllItems, currentEmpId],
  );
  const hero = useMemo(
    () => getFeaturedHeroItem(heroItems, todayKey, nowMinutes),
    [heroItems, nowMinutes, todayKey],
  );
  const hasScheduleItems = myScheduleItems.length > 0 || heroItems.length > 0;
  const heroTiming = useMemo(
    () => getHeroTiming(hero.item, todayKey, nowMinutes),
    [hero.item, nowMinutes, todayKey],
  );
  const heroShiftmates = useMemo(
    () => getHeroShiftmates(hero.item, upcomingAllItems, currentEmpId),
    [upcomingAllItems, currentEmpId, hero.item],
  );
  const heroFollowUpItems = useMemo(
    () => getHeroFollowUpItems(hero.item, heroItems),
    [hero.item, heroItems],
  );
  const heroFollowUpTimings = useMemo(
    () => heroFollowUpItems.map((item) => getHeroTiming(item, todayKey, nowMinutes)),
    [heroFollowUpItems, nowMinutes, todayKey],
  );
  const heroSegmentCount = hero.item ? getWorkedSegments(hero.item.entry).length : 0;
  const weeklyHours = useMemo(
    () => currentHours.find((row) => row.empId === currentEmpId)?.totalHours ?? 0,
    [currentEmpId, currentHours],
  );
  const coverRequests = useMemo(
    () =>
      currentEmpId
        ? shiftRequests.myRequests
            .filter(
              (request) =>
                request.status === "open" &&
                request.targetEmpId === currentEmpId &&
                isDateInCurrentOrFutureRange(
                  getRelevantRequestDateKey(request, currentEmpId),
                  periodStartKey,
                  periodEndKey,
                  todayKey,
                ),
            )
            .sort(compareRequestsByDate)
        : [],
    [currentEmpId, periodEndKey, periodStartKey, shiftRequests.myRequests, todayKey],
  );
  const availableShiftItems = useMemo(
    () =>
      buildAvailableShiftItems({
        assignmentById,
        currentEmpId,
        currentEmployee,
        currentPeriodShifts,
        jobs,
        openPickups: shiftRequests.openPickups,
        openShifts,
        now,
        periodEndKey,
        periodStartKey,
        shiftById,
        shiftCategories,
        todayKey,
        timeZone: org.timezone ?? null,
        visibility: org.openShiftVisibility,
      }),
    [
      assignmentById,
      currentEmpId,
      currentEmployee,
      currentPeriodShifts,
      jobs,
      now,
      openShifts,
      org.openShiftVisibility,
      org.timezone,
      periodEndKey,
      periodStartKey,
      shiftById,
      shiftCategories,
      shiftRequests.openPickups,
      todayKey,
    ],
  );
  const dashboardActionItems = useMemo(
    () =>
      buildDashboardActionItems({
        availableShiftItems,
        coverRequests,
        currentEmpId,
      }),
    [availableShiftItems, coverRequests, currentEmpId],
  );

  if (!currentEmpId || !currentEmployee) {
    return (
      <section className="dg-card" data-testid="user-dashboard-unlinked">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title">No linked staff profile</div>
            <div className="dg-card-subtitle">
              Your account is not connected to an employee record.
            </div>
          </div>
        </div>
        <div className="dg-card-body" style={{ padding: "18px" }}>
          <EmptyState
            size="inline"
            icon={<UserRound size={22} />}
            title="Schedule unavailable"
            description="Ask an administrator to link this account to a staff profile."
          />
        </div>
      </section>
    );
  }

  // Below the tablet breakpoint the dashboard stacks in normal flow and the
  // page scrolls. Above it, it becomes a viewport-locked two-pane layout: the
  // main column and the open-shifts rail each scroll on their own and the page
  // itself never scrolls.
  const stackLayout = isMobile || isTablet;

  const topGrid = (
    <div
      data-testid="user-dashboard-top-grid"
      style={{
        alignItems: "stretch",
        columnGap: "var(--dg-space-xl)",
        display: "grid",
        gridTemplateColumns: isMobile
          ? "minmax(0, 1fr)"
          : `minmax(0, ${HERO_MAX_WIDTH}px) minmax(320px, 1fr)`,
        rowGap: "var(--dg-space-lg)",
      }}
    >
      {hero.item ? (
        <div
          data-testid="user-dashboard-hero-shell"
          style={{
            gridColumn: isMobile ? undefined : "1",
            gridRow: isMobile ? undefined : "1 / span 2",
            maxWidth: isMobile ? "none" : `${HERO_MAX_WIDTH}px`,
            width: "100%",
          }}
        >
          <MeHeroCard
            isCompact={isTablet}
            isDarkTheme={isDarkTheme}
            followUpItems={heroFollowUpItems}
            followUpTimings={heroFollowUpTimings}
            item={hero.item}
            segmentCount={heroSegmentCount}
            shiftmates={heroShiftmates}
            status={hero.status}
            timing={heroTiming}
            stretch={isMobile ? false : true}
          />
        </div>
      ) : null}

      <CoverRequestsSection
        requests={coverRequests}
        style={{
          gridColumn: isMobile ? undefined : "2",
          gridRow: isMobile ? undefined : "1",
        }}
      />
      <AvailableShiftsSection
        isTwoWeekView={isTwoWeekView}
        items={availableShiftItems}
        style={{
          gridColumn: isMobile ? undefined : "2",
          gridRow: isMobile ? undefined : "2",
        }}
      />
    </div>
  );

  const myWeek = (
    <MyWeekSection
      items={myScheduleItems}
      isTwoWeekView={isTwoWeekView}
      todayKey={todayKey}
      weeklyHours={weeklyHours}
    />
  );

  const railSection = (
    <ActionRailSection
      currentEmpId={currentEmpId}
      items={dashboardActionItems}
      onClaim={shiftRequests.claim}
      onRespond={shiftRequests.respond}
      onVolunteer={shiftRequests.volunteer}
      scrollable={!stackLayout}
      shiftById={shiftById}
      style={
        stackLayout
          ? undefined
          : {
              flexShrink: 0,
              minHeight: 0,
              paddingTop: PANE_SCROLL_PADDING,
              width: 360,
            }
      }
    />
  );

  return (
    <div
      data-testid="user-dashboard-me-layout"
      style={
        stackLayout
          ? {
              display: "flex",
              flexDirection: "column",
              gap: "var(--dg-space-xl)",
            }
          : { display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }
      }
    >
      {!hasScheduleItems ? (
        <ScheduleEmptyState isMobile={isMobile} isTwoWeekView={isTwoWeekView} />
      ) : stackLayout ? (
        <div
          data-testid="user-dashboard-content-grid"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--dg-space-xl)",
          }}
        >
          {topGrid}
          {railSection}
          {myWeek}
        </div>
      ) : (
        <div
          data-testid="user-dashboard-content-grid"
          style={{
            columnGap: "var(--dg-space-xl)",
            display: "flex",
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            className="dg-no-scrollbar"
            data-testid="user-dashboard-main-pane"
            style={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              // Horizontal padding keeps card borders/shadows off the scroll
              // container's clipping edge (overflow-y:auto also clips x).
              // The left side cancels its own padding with a matching
              // negative margin (same trick as mobile's MyScheduleCard
              // scrollView/scrollContent split) so the pane's content still
              // lands flush with DashboardGreeting above it, which sits
              // outside this pane and only gets contentStyle's own 16px —
              // without the cancel, the hero card sat 16px further right.
              overflowY: "auto",
              marginLeft: -PANE_SCROLL_GUTTER,
              paddingLeft: PANE_SCROLL_GUTTER,
              paddingRight: PANE_SCROLL_GUTTER,
              scrollbarWidth: "none",
            }}
          >
            {/* An inner block flex column so children keep their natural
                height; the scroll container itself must not be the flex
                parent, or its children shrink to fit instead of overflowing.
                Top/bottom padding give breathing room at the start and end of
                the scroll while the pane stays flush to the screen edges. */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--dg-space-xl)",
                paddingBottom: PANE_SCROLL_PADDING,
                paddingTop: PANE_SCROLL_PADDING,
              }}
            >
              {topGrid}
              {myWeek}
            </div>
          </div>
          {railSection}
        </div>
      )}
    </div>
  );
}

function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeoutId: number | undefined;

    function scheduleNextTick() {
      const current = new Date();
      const delay = 60_000 - current.getSeconds() * 1000 - current.getMilliseconds();
      timeoutId = window.setTimeout(
        () => {
          setNow(new Date());
          scheduleNextTick();
        },
        Math.max(250, delay),
      );
    }

    scheduleNextTick();

    return () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return now;
}

function buildScheduleItemsFromShiftMap(input: {
  absenceTypeById: Map<number, AbsenceType>;
  assignmentById: Map<number, AssignmentDefinition>;
  currentPeriodShifts: ShiftMap;
  employeeById: Map<string, Employee>;
  focusAreaById: Map<number, FocusArea>;
  jobById: Map<number, JobDefinition>;
  shiftById: Map<number, { abbr?: string | null; name: string }>;
  isDarkTheme: boolean;
}): DashboardScheduleItem[] {
  const items: DashboardScheduleItem[] = [];

  for (const [key, entry] of Object.entries(input.currentPeriodShifts)) {
    if (entry.isDelete) {
      continue;
    }

    const parsedKey = parseShiftMapKey(key);
    if (!parsedKey) {
      continue;
    }

    const employee = input.employeeById.get(parsedKey.employeeId);
    const employeeName = employee ? formatEmployeeName(employee) : "Staff";
    const date = new Date(`${parsedKey.dateKey}T00:00:00`);
    const absenceTypeId = entry.absenceTypeId ?? null;

    if (absenceTypeId != null) {
      const absence = input.absenceTypeById.get(absenceTypeId) ?? null;
      items.push({
        date,
        dateKey: parsedKey.dateKey,
        employeeId: parsedKey.employeeId,
        employeeName,
        entry,
        key: `${key}:absence`,
        segment: buildAbsenceSegment(entry, absence, parsedKey.dateKey, input.isDarkTheme),
        segmentIndex: 0,
      });
      continue;
    }

    const rawSegments = getWorkedSegments(entry);
    rawSegments.forEach((rawSegment, segmentIndex) => {
      const segment = buildWorkedSegment({
        assignmentById: input.assignmentById,
        dateKey: parsedKey.dateKey,
        entry,
        focusAreaById: input.focusAreaById,
        jobById: input.jobById,
        rawSegment,
        segmentCount: rawSegments.length,
        segmentIndex,
        shiftById: input.shiftById,
        isDarkTheme: input.isDarkTheme,
      });

      if (!segment) {
        return;
      }

      items.push({
        date,
        dateKey: parsedKey.dateKey,
        employeeId: parsedKey.employeeId,
        employeeName,
        entry,
        key: `${key}:${segmentIndex}`,
        segment,
        segmentIndex,
      });
    });
  }

  return items.sort(compareScheduleItems);
}

function parseShiftMapKey(key: string): { employeeId: string; dateKey: string } | null {
  const splitIndex = key.indexOf("_");
  if (splitIndex <= 0) {
    return null;
  }

  return {
    employeeId: key.slice(0, splitIndex),
    dateKey: key.slice(splitIndex + 1),
  };
}

function getWorkedSegments(entry: ScheduleCellStateEntry): Array<Partial<ShiftJobSegment>> {
  const explicitSegments = [...(entry.segments ?? [])].sort(
    (left, right) => (left.position ?? 0) - (right.position ?? 0),
  );

  if (explicitSegments.length > 0) {
    return explicitSegments;
  }

  return entry.assignmentIds.map((assignmentId, index) => ({
    assignmentId,
    position: index,
  }));
}

function buildAbsenceSegment(
  entry: ScheduleCellStateEntry,
  absence: AbsenceType | null,
  dateKey: string,
  isDarkTheme: boolean,
): DashboardScheduleSegment {
  const label = absence?.name ?? absence?.label ?? entry.label ?? "Away";
  const resolved = absence
    ? resolveShiftPillColors(
        { color: absence.color, text: absence.text, border: absence.border },
        isDarkTheme,
      )
    : null;
  return {
    assignment: null,
    backgroundColor: resolved?.color ?? "var(--color-bg-secondary)",
    borderColor: resolved?.border ?? "var(--color-border)",
    chipLabel: label,
    dateKey,
    endTime: null,
    focusAreaId: null,
    focusAreaName: null,
    isAbsence: true,
    isGeneral: false,
    isMentored: false,
    jobAbbr: null,
    jobId: null,
    jobName: null,
    shiftAbbr: null,
    shiftId: null,
    shiftName: null,
    sortTime: "99:99:99",
    startTime: null,
    textColor: resolved?.text ?? "var(--color-text-secondary)",
    title: label,
    typeLabel: "Absence",
  };
}

function buildWorkedSegment(input: {
  assignmentById: Map<number, AssignmentDefinition>;
  dateKey: string;
  entry: ScheduleCellStateEntry;
  focusAreaById: Map<number, FocusArea>;
  jobById: Map<number, JobDefinition>;
  rawSegment: Partial<ShiftJobSegment>;
  segmentCount: number;
  segmentIndex: number;
  shiftById: Map<number, { abbr?: string | null; name: string }>;
  isDarkTheme: boolean;
}): DashboardScheduleSegment | null {
  const assignmentId =
    input.rawSegment.assignmentId ?? input.entry.assignmentIds[input.segmentIndex];
  const assignment = assignmentId != null ? (input.assignmentById.get(assignmentId) ?? null) : null;
  const shiftId = input.rawSegment.shiftId ?? assignment?.shiftId ?? assignment?.categoryId ?? null;
  const jobId = input.rawSegment.jobId ?? assignment?.jobId ?? null;

  if (jobId == null && assignment == null && !input.rawSegment.label) {
    return null;
  }

  const focusAreaId = input.rawSegment.focusAreaId ?? assignment?.focusAreaId ?? null;
  const focusAreaName =
    focusAreaId != null ? (input.focusAreaById.get(focusAreaId)?.name ?? null) : null;
  const rawShiftLabel =
    input.rawSegment.shiftName ??
    input.rawSegment.shiftAbbr ??
    input.rawSegment.label ??
    assignment?.label ??
    input.entry.label ??
    null;
  const shift =
    (shiftId != null ? (input.shiftById.get(shiftId) ?? null) : null) ??
    findShiftByDisplayLabel({
      rawLabel: rawShiftLabel,
      shiftAbbr: input.rawSegment.shiftAbbr ?? null,
      shiftById: input.shiftById,
    });
  const shiftName = input.rawSegment.shiftName ?? shift?.name ?? null;
  const shiftAbbr = input.rawSegment.shiftAbbr ?? shift?.abbr ?? null;
  const resolvedJob = jobId != null ? (input.jobById.get(jobId) ?? null) : null;
  // Hide the placeholder "Default shift job" (and any other job explicitly
  // configured show_on_grid: false) the same way MyScheduleRow.tsx and the
  // mobile app's own dashboard payload builder do — never surface its name,
  // whether it arrives via the resolved job record or the raw segment's own
  // (redundant) jobName/jobAbbr fields.
  const showJobName = resolvedJob == null || shouldShowJobOnGrid(resolvedJob);
  const jobName = showJobName ? (input.rawSegment.jobName ?? resolvedJob?.name ?? null) : null;
  const jobAbbr = showJobName ? (input.rawSegment.jobAbbr ?? resolvedJob?.abbr ?? null) : null;
  const isGeneral = assignment?.isGeneral === true || (shiftId == null && shift == null);
  const rawChipLabel =
    jobName ?? input.rawSegment.label ?? assignment?.label ?? input.entry.label ?? "Shift";
  const chipLabel = isGeneral
    ? rawChipLabel
    : deriveJobPillLabel({
        isShiftOnly: input.rawSegment.isShiftOnly === true,
        jobAbbr,
        jobName,
        rawLabel: rawChipLabel,
        shiftAbbr,
        shiftName,
      });
  const title = isGeneral
    ? "General shift"
    : (shiftName ?? assignment?.name ?? input.entry.label ?? "Shift");
  const customStartTime = getDelimitedValue(
    input.entry.customStartTime,
    input.segmentIndex,
    input.segmentCount,
  );
  const customEndTime = getDelimitedValue(
    input.entry.customEndTime,
    input.segmentIndex,
    input.segmentCount,
  );
  const startTime =
    customStartTime ?? input.rawSegment.startTime ?? assignment?.defaultStartTime ?? null;
  const endTime = customEndTime ?? input.rawSegment.endTime ?? assignment?.defaultEndTime ?? null;
  const resolved = assignment
    ? resolveShiftPillColors(
        { color: assignment.color, text: assignment.text, border: assignment.border },
        input.isDarkTheme,
      )
    : null;

  return {
    assignment,
    backgroundColor: resolved?.color ?? "var(--color-bg-secondary)",
    borderColor: resolved?.border ?? "var(--color-border)",
    chipLabel: isGeneral ? chipLabel : chipLabel || title,
    dateKey: input.dateKey,
    endTime,
    focusAreaId,
    focusAreaName,
    isAbsence: false,
    isGeneral,
    isMentored: input.rawSegment.isMentored === true,
    jobAbbr,
    jobId,
    jobName,
    shiftAbbr,
    shiftId,
    shiftName,
    sortTime: startTime ?? "99:99:99",
    startTime,
    textColor: resolved?.text ?? "var(--color-text-primary)",
    title,
    typeLabel: isGeneral ? "General shift" : null,
  };
}

function getDelimitedValue(
  value: string | null | undefined,
  index: number,
  count: number,
): string | null {
  if (!value) {
    return null;
  }

  const parts = value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    return parts[index] ?? null;
  }

  return count <= 1 ? (parts[0] ?? null) : null;
}

function compareScheduleItems(left: DashboardScheduleItem, right: DashboardScheduleItem): number {
  if (left.dateKey !== right.dateKey) {
    return left.dateKey.localeCompare(right.dateKey);
  }
  if (left.segment.sortTime !== right.segment.sortTime) {
    return left.segment.sortTime.localeCompare(right.segment.sortTime);
  }
  return left.employeeName.localeCompare(right.employeeName);
}

function compareRequestsByDate(left: ShiftRequest, right: ShiftRequest): number {
  if (left.requesterShiftDate !== right.requesterShiftDate) {
    return left.requesterShiftDate.localeCompare(right.requesterShiftDate);
  }

  return getRequestStartTime(left).localeCompare(getRequestStartTime(right));
}

function getRelevantRequestDateKey(request: ShiftRequest, currentEmpId: string | null): string {
  if (
    request.type === "swap" &&
    currentEmpId != null &&
    request.targetEmpId === currentEmpId &&
    request.targetShiftDate
  ) {
    return request.targetShiftDate;
  }

  return request.requesterShiftDate;
}

function getAvailableShiftSortTime(item: AvailableShiftItem): string {
  if (item.kind === "pickup") {
    return getRequestStartTime(item.request);
  }

  return item.assignment?.defaultStartTime ?? "99:99:99";
}

function expandShiftDisplayLabel(input: {
  isShiftOnly?: boolean;
  jobAbbr?: string | null;
  jobName?: string | null;
  rawLabel: string;
  shiftAbbr?: string | null;
  shiftName?: string | null;
}): string {
  const rawLabel = input.rawLabel.trim();
  const shiftName = input.shiftName?.trim() ?? "";
  const shiftAbbr = input.shiftAbbr?.trim() ?? "";

  if (!shiftName) {
    return rawLabel;
  }

  if (!rawLabel || input.isShiftOnly || labelsEqual(rawLabel, shiftAbbr)) {
    return shiftName;
  }

  const suffix = getLabelSuffixAfterShiftCode(rawLabel, shiftAbbr);
  if (suffix == null) {
    return rawLabel;
  }

  if (!suffix) {
    return shiftName;
  }

  const expandedSuffix =
    input.jobName && labelsEqual(suffix, input.jobAbbr) ? input.jobName : suffix;

  return `${shiftName} · ${expandedSuffix}`;
}

// Job pill text (ShiftPill) shows only the job, never the shift — the shift
// name is already the heading it sits under, so repeating it here would just
// duplicate what the user already read a line above.
function deriveJobPillLabel(input: {
  isShiftOnly?: boolean;
  jobAbbr?: string | null;
  jobName?: string | null;
  rawLabel: string;
  shiftAbbr?: string | null;
  shiftName?: string | null;
}): string {
  const jobName = input.jobName?.trim();
  if (jobName) {
    return jobName;
  }

  const rawLabel = input.rawLabel.trim();
  const shiftAbbr = input.shiftAbbr?.trim() ?? "";
  const shiftName = input.shiftName?.trim() ?? "";

  if (!rawLabel || input.isShiftOnly || labelsEqual(rawLabel, shiftAbbr)) {
    return shiftName || rawLabel;
  }

  const suffix = getLabelSuffixAfterShiftCode(rawLabel, shiftAbbr);
  if (suffix == null) {
    return rawLabel;
  }

  return suffix || shiftName || rawLabel;
}

function getLabelSuffixAfterShiftCode(rawLabel: string, shiftAbbr?: string | null): string | null {
  const normalizedShiftAbbr = shiftAbbr?.trim();
  if (!normalizedShiftAbbr) {
    return null;
  }

  const normalizedRaw = rawLabel.trim();
  if (
    normalizedRaw.localeCompare(normalizedShiftAbbr, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return "";
  }

  if (!normalizedRaw.toLowerCase().startsWith(normalizedShiftAbbr.toLowerCase())) {
    return null;
  }

  const nextCharacter = normalizedRaw[normalizedShiftAbbr.length] ?? "";
  if (nextCharacter && !/[\s·•/|+.-]/.test(nextCharacter)) {
    return null;
  }

  return normalizedRaw
    .slice(normalizedShiftAbbr.length)
    .replace(/^[\s·•/|+.-]+/, "")
    .trim();
}

function findShiftByDisplayLabel(input: {
  rawLabel: string | null;
  shiftAbbr: string | null;
  shiftById: Map<number, { abbr?: string | null; name: string }>;
}): { abbr?: string | null; name: string } | null {
  const rawLabel = input.rawLabel?.trim() ?? "";
  const shiftAbbr = input.shiftAbbr?.trim() ?? "";

  for (const shift of input.shiftById.values()) {
    if (shiftAbbr && labelsEqual(shift.abbr, shiftAbbr)) {
      return shift;
    }
  }

  if (!rawLabel) {
    return null;
  }

  for (const shift of input.shiftById.values()) {
    if (labelsEqual(rawLabel, shift.name)) {
      return shift;
    }

    if (getLabelSuffixAfterShiftCode(rawLabel, shift.abbr) != null) {
      return shift;
    }
  }

  return null;
}

function labelsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(
    left?.trim() && right?.trim() && left.trim().toLowerCase() === right.trim().toLowerCase(),
  );
}

function getFeaturedHeroItem(
  items: DashboardScheduleItem[],
  todayKey: string,
  nowMinutes: number,
): { item: DashboardScheduleItem | null; status: HeroStatus } {
  const todayItems = items.filter((item) => item.dateKey === todayKey);
  const activeItem =
    todayItems.find(
      (item) => !item.segment.isAbsence && isItemActiveAt(item, todayKey, nowMinutes),
    ) ?? null;

  if (activeItem) {
    return { item: activeItem, status: "active" };
  }

  const upcomingTodayItem =
    todayItems.find(
      (item) =>
        !item.segment.isAbsence &&
        item.segment.startTime != null &&
        toRelativeMinutes(item.dateKey, item.segment.startTime, todayKey) > nowMinutes,
    ) ?? null;

  if (upcomingTodayItem) {
    return { item: upcomingTodayItem, status: "upcoming" };
  }

  const awayTodayItem = todayItems.find((item) => item.segment.isAbsence) ?? null;
  if (awayTodayItem) {
    return { item: awayTodayItem, status: "away" };
  }

  const nextWorkedItem =
    items.find((item) => item.dateKey.localeCompare(todayKey) > 0 && !item.segment.isAbsence) ??
    null;
  if (nextWorkedItem) {
    return {
      item: nextWorkedItem,
      status: "upcoming",
    };
  }

  const nextItem = items.find((item) => item.dateKey.localeCompare(todayKey) > 0) ?? null;
  if (nextItem) {
    return { item: nextItem, status: "away" };
  }

  const firstItem = items.find((item) => !item.segment.isAbsence) ?? items[0] ?? null;
  return {
    item: firstItem,
    status: firstItem ? (firstItem.segment.isAbsence ? "away" : "scheduled") : "empty",
  };
}

function isItemActiveAt(
  item: DashboardScheduleItem,
  todayKey: string,
  nowMinutes: number,
): boolean {
  const start = item.segment.startTime;
  const end = item.segment.endTime;
  if (!start || !end) {
    return false;
  }

  const startMinutes = toRelativeMinutes(item.dateKey, start, todayKey);
  let endMinutes = toRelativeMinutes(item.dateKey, end, todayKey);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

function getHeroTiming(
  item: DashboardScheduleItem | null,
  todayKey: string,
  nowMinutes: number,
): HeroTiming | null {
  if (!item || item.segment.isAbsence) {
    return null;
  }

  const start = item.segment.startTime;
  const end = item.segment.endTime;
  if (!start || !end) {
    return null;
  }

  const startMinutes = toRelativeMinutes(item.dateKey, start, todayKey);
  let endMinutes = toRelativeMinutes(item.dateKey, end, todayKey);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const totalMinutes = Math.max(1, endMinutes - startMinutes);

  if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
    return {
      label: `Ends in ${formatDurationLabel(endMinutes - nowMinutes)}`,
      progress: Math.min(1, Math.max(0.08, (nowMinutes - startMinutes) / totalMinutes)),
    };
  }

  if (nowMinutes < startMinutes) {
    return {
      label: `Starts in ${formatDurationLabel(startMinutes - nowMinutes)}`,
      progress: null,
    };
  }

  return { label: "Completed", progress: 1 };
}

// Minutes relative to today's midnight in the organization's timezone. The
// shift's calendar day (dateKey) and the current day (todayKey) are both org-tz
// dates, so the day delta plus the shift's wall-clock time yields a value
// comparable to the org-tz "now" minutes — no browser-timezone contamination.
function toRelativeMinutes(dateKey: string, time: string, todayKey: string): number {
  return isoDayDelta(todayKey, dateKey) * 24 * 60 + hhmmToMinutes(time);
}

function hhmmToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function isoDayDelta(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 0;
  }
  return Math.round((to - from) / 86_400_000);
}

function formatDurationLabel(totalMinutes: number): string {
  const minutes = Math.max(0, Math.ceil(totalMinutes));
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getHeroShiftmates(
  heroItem: DashboardScheduleItem | null,
  allItems: DashboardScheduleItem[],
  currentEmpId: string | null,
): DashboardScheduleItem[] {
  if (!heroItem || heroItem.segment.isAbsence || heroItem.segment.isGeneral) {
    return [];
  }

  const seen = new Set<string>();
  return allItems.filter((item) => {
    if (
      item.dateKey !== heroItem.dateKey ||
      item.employeeId === currentEmpId ||
      item.segment.isAbsence ||
      seen.has(item.employeeId) ||
      !segmentsShareShiftAndFocusArea(heroItem.segment, item.segment)
    ) {
      return false;
    }

    seen.add(item.employeeId);
    return true;
  });
}

function getHeroFollowUpItems(
  heroItem: DashboardScheduleItem | null,
  myItems: DashboardScheduleItem[],
): DashboardScheduleItem[] {
  if (!heroItem || heroItem.segment.isAbsence) {
    return [];
  }

  return myItems.filter(
    (item) =>
      item.employeeId === heroItem.employeeId &&
      item.dateKey === heroItem.dateKey &&
      item.segmentIndex > heroItem.segmentIndex &&
      !item.segment.isAbsence,
  );
}

function segmentsShareShiftAndFocusArea(
  source: DashboardScheduleSegment,
  candidate: DashboardScheduleSegment,
): boolean {
  if (source.focusAreaId !== candidate.focusAreaId) {
    return false;
  }

  if (source.shiftId != null || candidate.shiftId != null) {
    return source.shiftId === candidate.shiftId;
  }

  return (
    source.title === candidate.title &&
    source.chipLabel === candidate.chipLabel &&
    source.startTime === candidate.startTime &&
    source.endTime === candidate.endTime
  );
}

function buildAvailableShiftItems(input: {
  assignmentById: Map<number, AssignmentDefinition>;
  currentEmpId: string | null;
  currentEmployee: Employee | undefined;
  currentPeriodShifts: ShiftMap;
  jobs: JobDefinition[];
  now: Date;
  openPickups: ShiftRequest[];
  openShifts: DashboardContentProps["openShifts"];
  periodEndKey: string;
  periodStartKey: string;
  shiftById: Map<number, { abbr?: string | null; name: string }>;
  shiftCategories: ShiftCategory[];
  todayKey: string;
  timeZone?: string | null;
  visibility?: OpenShiftVisibility;
}): AvailableShiftItem[] {
  const currentEmpId = input.currentEmpId;
  if (!currentEmpId) {
    return [];
  }

  const eligibilityContext = {
    assignmentById: input.assignmentById,
    shiftCategories: input.shiftCategories,
    jobs: input.jobs,
  };
  const isEligible = (candidateAssignmentIds: number[]) =>
    isEmployeeEligibleForOpenShift(candidateAssignmentIds, input.currentEmployee ?? null, eligibilityContext);

  // Visibility governs the staff view only; this dashboard is never the
  // scheduler tool. `always` shows every open shift regardless of the viewer's
  // own schedule; `hidden` drops the source entirely; `matched` (default)
  // keeps the conflict filter so a user only sees shifts they could take.
  // Either way, a shift the viewer isn't personally qualified for (focus
  // area / role / certification) is never shown — they could never claim it.
  const coverageGapVisibility = input.visibility?.coverageGap ?? "matched";
  const calloffVisibility = input.visibility?.calloff ?? "matched";

  const pickupItems: AvailableShiftItem[] =
    calloffVisibility === "hidden"
      ? []
      : input.openPickups
          .filter(
            (request) =>
              isDateInCurrentOrFutureRange(
                request.requesterShiftDate,
                input.periodStartKey,
                input.periodEndKey,
                input.todayKey,
              ) &&
              !hasShiftRequestStarted(request, input.now, input.timeZone ?? null) &&
              isEligible(request.requesterAssignmentDefinitionIds),
          )
          .map((request) => ({
            date: new Date(`${request.requesterShiftDate}T00:00:00`),
            dateKey: request.requesterShiftDate,
            id: `pickup-${request.id}`,
            kind: "pickup" as const,
            request,
            subtitle: formatRequestSubtitle(request, input.shiftById),
            timeRange: formatRequestTimeRange(request),
            title: formatRequestShiftLabel(request, input.shiftById) || "Open shift",
          }));

  const coverageItems: AvailableShiftItem[] =
    coverageGapVisibility === "hidden"
      ? []
      : input.openShifts
          .filter((openShift) => {
            const dateKey = formatDateKey(openShift.date);
            if (
              !isDateInCurrentOrFutureRange(
                dateKey,
                input.periodStartKey,
                input.periodEndKey,
                input.todayKey,
              )
            ) {
              return false;
            }
            if (
              hasDashboardOpenShiftStarted({
                assignmentById: input.assignmentById,
                now: input.now,
                openShift,
                timeZone: input.timeZone ?? null,
              })
            ) {
              return false;
            }
            const candidateAssignmentIds = openShift.eligibleAssignmentDefinitionIds?.length
              ? openShift.eligibleAssignmentDefinitionIds
              : [openShift.preferredOpenAssignmentDefinitionId];
            if (!isEligible(candidateAssignmentIds)) {
              return false;
            }
            if (coverageGapVisibility === "always") {
              return true;
            }
            return !doesOpenShiftConflictWithMySchedule({
              assignmentById: input.assignmentById,
              currentEmpId,
              currentPeriodShifts: input.currentPeriodShifts,
              openShift,
            });
          })
          .map((openShift) => {
            const assignment =
              input.assignmentById.get(openShift.preferredOpenAssignmentDefinitionId) ?? null;
            return {
              assignment,
              date: openShift.date,
              dateKey: formatDateKey(openShift.date),
              id: `coverage-${openShift.id}`,
              kind: "coverage" as const,
              openShift,
              subtitle: [
                openShift.focusAreaName,
                openShift.needed > 1 ? `${openShift.needed} teammates needed` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              timeRange: openShift.timeRange || formatAssignmentTimeRange(assignment),
              title: formatOpenShiftTitle(openShift, assignment, input.shiftById),
            };
          });

  return [...pickupItems, ...coverageItems].sort((left, right) => {
    if (left.dateKey !== right.dateKey) {
      return left.dateKey.localeCompare(right.dateKey);
    }

    return (left.timeRange ?? "").localeCompare(right.timeRange ?? "");
  });
}

function buildDashboardActionItems(input: {
  availableShiftItems: AvailableShiftItem[];
  coverRequests: ShiftRequest[];
  currentEmpId: string | null;
}): DashboardActionItem[] {
  const requestItems: DashboardActionItem[] = input.coverRequests.map((request) => {
    const dateKey = getRelevantRequestDateKey(request, input.currentEmpId);
    return {
      date: new Date(`${dateKey}T00:00:00`),
      dateKey,
      id: `request-${request.id}`,
      kind: "request" as const,
      request,
      sortTime: getRequestStartTime(request),
    };
  });
  const shiftItems: DashboardActionItem[] = input.availableShiftItems.map((item) => ({
    date: item.date,
    dateKey: item.dateKey,
    id: item.id,
    item,
    kind: "available-shift" as const,
    sortTime: getAvailableShiftSortTime(item),
  }));

  return [...requestItems, ...shiftItems].sort((left, right) => {
    if (left.dateKey !== right.dateKey) {
      return left.dateKey.localeCompare(right.dateKey);
    }
    if (left.sortTime !== right.sortTime) {
      return left.sortTime.localeCompare(right.sortTime);
    }
    return left.id.localeCompare(right.id);
  });
}

function hasDashboardOpenShiftStarted(input: {
  assignmentById: Map<number, AssignmentDefinition>;
  now: Date;
  openShift: DashboardContentProps["openShifts"][number];
  timeZone?: string | null;
}): boolean {
  const assignment = input.assignmentById.get(input.openShift.preferredOpenAssignmentDefinitionId);

  return hasShiftStartedAtTimeRanges({
    shiftDate: formatDateKey(input.openShift.date),
    timeRanges: [{ start: assignment?.defaultStartTime ?? "" }],
    now: input.now,
    timeZone: input.timeZone ?? null,
  });
}

function doesOpenShiftConflictWithMySchedule(input: {
  assignmentById: Map<number, AssignmentDefinition>;
  currentEmpId: string;
  currentPeriodShifts: ShiftMap;
  openShift: DashboardContentProps["openShifts"][number];
}): boolean {
  const dateKey = formatDateKey(input.openShift.date);
  const entry = input.currentPeriodShifts[`${input.currentEmpId}_${dateKey}`];
  if (!entry || entry.isDelete || entry.absenceTypeId != null) {
    return false;
  }

  const openAssignment = input.assignmentById.get(
    input.openShift.preferredOpenAssignmentDefinitionId,
  );
  const openStart = openAssignment?.defaultStartTime ?? null;
  const openEnd = openAssignment?.defaultEndTime ?? null;
  const rawSegments = getWorkedSegments(entry);

  if (!openStart || !openEnd) {
    return rawSegments.length > 0;
  }

  return rawSegments.some((segment, index) => {
    const assignmentId = segment.assignmentId ?? entry.assignmentIds[index];
    const assignment = assignmentId != null ? input.assignmentById.get(assignmentId) : null;
    const start =
      getDelimitedValue(entry.customStartTime, index, rawSegments.length) ??
      segment.startTime ??
      assignment?.defaultStartTime ??
      null;
    const end =
      getDelimitedValue(entry.customEndTime, index, rawSegments.length) ??
      segment.endTime ??
      assignment?.defaultEndTime ??
      null;

    return Boolean(start && end && timeRangesOverlap(openStart, openEnd, start, end));
  });
}

function timeRangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
): boolean {
  const left = normalizeRangeMinutes(leftStart, leftEnd);
  const right = normalizeRangeMinutes(rightStart, rightEnd);
  return left.start < right.end && right.start < left.end;
}

function normalizeRangeMinutes(start: string, end: string): { start: number; end: number } {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  return {
    start: startMinutes,
    end: endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes,
  };
}

function isDateInRange(dateKey: string, startKey: string, endKey: string): boolean {
  if (!startKey || !endKey) {
    return true;
  }

  return dateKey >= startKey && dateKey <= endKey;
}

function isDateInCurrentOrFutureRange(
  dateKey: string,
  startKey: string,
  endKey: string,
  todayKey: string,
): boolean {
  return dateKey >= todayKey && isDateInRange(dateKey, startKey, endKey);
}

function MeHeroCard({
  followUpItems,
  followUpTimings,
  isCompact,
  isDarkTheme,
  item,
  segmentCount,
  shiftmates,
  status,
  stretch,
  timing,
}: {
  followUpItems: DashboardScheduleItem[];
  followUpTimings: Array<HeroTiming | null>;
  isCompact: boolean;
  isDarkTheme: boolean;
  item: DashboardScheduleItem;
  segmentCount: number;
  shiftmates: DashboardScheduleItem[];
  status: HeroStatus;
  stretch: boolean;
  timing: HeroTiming | null;
}) {
  const dateParts = getDateParts(item.date);
  const badgeLabel = getHeroStatusLabel(status);

  return (
    <section
      data-testid="user-dashboard-hero"
      style={{
        background: isDarkTheme ? DASHBOARD_HERO_BG_DARK : DASHBOARD_HERO_BG_LIGHT,
        borderRadius: "var(--dg-radius-xl)",
        boxShadow: "var(--shadow-md)",
        color: "#fff",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        height: stretch ? "100%" : undefined,
        overflow: "hidden",
        padding: isCompact ? "20px" : "24px",
      }}
    >
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          gap: 16,
          justifyContent: "space-between",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: 8,
              marginBottom: 18,
            }}
          >
            <span
              style={{
                background: status === "active" ? "#86efac" : "#bfdbfe",
                borderRadius: 999,
                display: "inline-block",
                height: 9,
                width: 9,
              }}
            />
            <span
              style={{
                color: "rgba(255,255,255,0.82)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {badgeLabel}
            </span>
          </div>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <h2
              style={{
                color: "#fff",
                fontSize: isCompact ? "1.55rem" : "1.9rem",
                fontWeight: 750,
                letterSpacing: 0,
                lineHeight: 1.08,
                margin: 0,
              }}
            >
              {item.segment.title}
            </h2>
            {segmentCount > 1 ? (
              <SplitShiftBadge inverse label={`Shift ${item.segmentIndex + 1}`} />
            ) : null}
          </div>
        </div>

        <div
          aria-label={dateParts.fullLabel}
          style={{
            alignItems: "center",
            background: "rgba(255,255,255,0.14)",
            border: "1px solid rgba(255,255,255,0.22)",
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            minWidth: 58,
            padding: "9px 10px",
          }}
        >
          <span
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            {dateParts.weekday}
          </span>
          <span
            style={{
              color: "#fff",
              fontSize: 24,
              fontWeight: 750,
              lineHeight: 1,
            }}
          >
            {dateParts.day}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          gap: 14,
          marginTop: 22,
          minHeight: 0,
        }}
      >
        {item.segment.focusAreaName ? (
          <HeroInfoRow icon={<MapPin size={18} />} text={item.segment.focusAreaName} />
        ) : null}
        <HeroPillRow segment={item.segment} inverse />
        {formatSegmentTimeRange(item.segment) ? (
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 12,
              justifyContent: "space-between",
            }}
          >
            <HeroInfoRow
              icon={<Clock3 size={20} />}
              text={formatSegmentTimeRange(item.segment) ?? ""}
            />
            {timing ? (
              <span
                style={{
                  color: "rgba(255,255,255,0.78)",
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {timing.label}
              </span>
            ) : null}
          </div>
        ) : null}
        {timing?.progress != null ? (
          <div
            aria-hidden
            style={{
              background: "rgba(255,255,255,0.2)",
              borderRadius: 999,
              height: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 999,
                height: "100%",
                width: `${Math.round(timing.progress * 100)}%`,
              }}
            />
          </div>
        ) : null}
        <div
          data-testid="user-dashboard-hero-bottom-stack"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            // Pinning to the bottom only reads right for a single shift — with
            // a double shift there's more content to show, so let it flow
            // naturally (the surrounding column's own gap:14 already spaces it
            // from the progress bar above) instead of stacking an extra margin
            // on top of that gap, which left far more space above the
            // "Working with" pill than the gap:12 below it to the next segment.
            marginTop: followUpItems.length > 0 ? 0 : "auto",
          }}
        >
          <ShiftmatesRow items={shiftmates} inverse />
          {followUpItems.map((followUpItem, index) => (
            <HeroSplitShiftSegment
              item={followUpItem}
              key={followUpItem.key}
              timing={followUpTimings[index] ?? null}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ScheduleEmptyState({
  isMobile,
  isTwoWeekView,
  style,
}: {
  isMobile: boolean;
  isTwoWeekView: boolean;
  style?: CSSProperties;
}) {
  const periodLabel = isTwoWeekView ? "these 2 weeks" : "this week";
  return (
    <EmptyState
      data-testid="user-dashboard-empty-schedule"
      icon={<CalendarDays size={24} />}
      title={`You're not scheduled ${periodLabel}`}
      description="When your shifts get published, they'll show up right here."
      style={{
        minHeight: isMobile ? 260 : 360,
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

function HeroInfoRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div
      style={{
        alignItems: "center",
        color: "rgba(255,255,255,0.82)",
        display: "flex",
        gap: 8,
        minWidth: 0,
      }}
    >
      {/* lucide glyphs (MapPin especially) draw with a few px of empty margin
          inside their own viewBox, so a flush icon reads as inset compared to
          the solid-edged text/pills/bar above and below it in this column —
          nudge left to compensate. */}
      <span style={{ display: "inline-flex", flexShrink: 0, marginLeft: -2 }}>{icon}</span>
      <span
        style={{
          fontSize: 15,
          fontWeight: 650,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    </div>
  );
}

function HeroPillRow({
  segment,
  inverse = false,
}: {
  segment: DashboardScheduleSegment;
  inverse?: boolean;
}) {
  const showShiftPill = shouldShowShiftPill(segment);
  const showTypeLabel =
    Boolean(segment.typeLabel) &&
    normalizeDisplayLabel(segment.typeLabel) !== normalizeDisplayLabel(segment.title);

  if (!showTypeLabel && !showShiftPill && !segment.isMentored) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {showTypeLabel ? (
        <div
          style={{
            color: inverse ? "#fff" : "var(--color-text-primary)",
            fontSize: inverse ? 20 : 15,
            fontWeight: 750,
            lineHeight: 1.1,
          }}
        >
          {segment.typeLabel}
        </div>
      ) : null}
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {showShiftPill ? <ShiftPill segment={segment} /> : null}
        {segment.isMentored ? <MentoredPill inverse={inverse} /> : null}
      </div>
    </div>
  );
}

function ShiftPill({ segment }: { segment: DashboardScheduleSegment }) {
  return (
    <span
      style={{
        background: segment.backgroundColor,
        border: `1px solid ${segment.borderColor}`,
        borderRadius: 7,
        color: segment.textColor,
        display: "inline-flex",
        fontSize: 12,
        fontWeight: 750,
        lineHeight: 1.3,
        maxWidth: "100%",
        padding: "7px 10px",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {segment.chipLabel}
      </span>
    </span>
  );
}

function MentoredPill({ inverse = false }: { inverse?: boolean }) {
  return (
    <span
      style={{
        background: inverse ? "rgba(255,255,255,0.16)" : "var(--color-bg-secondary)",
        border: inverse ? "1px solid rgba(255,255,255,0.24)" : "1px solid var(--color-border)",
        borderRadius: 7,
        color: inverse ? "#fff" : "var(--color-text-secondary)",
        display: "inline-flex",
        fontSize: 12,
        fontWeight: 750,
        lineHeight: 1,
        padding: "7px 10px",
      }}
    >
      Mentored
    </span>
  );
}

// A "Shift N" position label — inspired by the mobile split-shift badge
// (SplitShiftBadge in apps/mobile/src/features/schedule/components/SplitShift.tsx),
// but spelling out each segment's position instead of just a "N shifts"
// count. `inverse` for the hero's gradient background; the default
// (brand-token) styling matches mobile's own non-inverse badge for use on a
// normal card surface (e.g. the "Your Week" list).
function SplitShiftBadge({ inverse = false, label }: { inverse?: boolean; label: string }) {
  return (
    <span
      style={{
        alignItems: "center",
        background: inverse ? "rgba(255,255,255,0.16)" : "var(--color-brand-bg)",
        border: inverse ? "1px solid rgba(255,255,255,0.28)" : "1px solid var(--color-brand-border)",
        borderRadius: 999,
        color: inverse ? "#fff" : "var(--color-brand)",
        display: "inline-flex",
        flexShrink: 0,
        fontSize: 13,
        fontWeight: 700,
        gap: 5,
        padding: "6px 12px",
      }}
    >
      <Layers size={14} />
      {label}
    </span>
  );
}

// A same-day, later-segment shift (a "double shift"). Sits directly on the
// hero gradient with a dashed divider above it, matching the mobile hero's
// inline SplitShiftSegmentList (variant="hero") instead of a boxed sub-card.
// Sized close to the featured segment above it (not a small caption) so the
// card reads as one continuous shift, not a big headline plus fine print.
function HeroSplitShiftSegment({
  item,
  timing,
}: {
  item: DashboardScheduleItem;
  timing: HeroTiming | null;
}) {
  const timeRange = formatSegmentTimeRange(item.segment);

  return (
    <div
      data-testid="user-dashboard-hero-secondary-shift"
      style={{
        borderTop: "1px dashed rgba(255,255,255,0.24)",
        color: "rgba(255,255,255,0.86)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        paddingTop: 16,
      }}
    >
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          justifyContent: "space-between",
          minWidth: 0,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            minWidth: 0,
          }}
        >
          <span
            style={{
              color: "#fff",
              fontSize: 20,
              fontWeight: 750,
              lineHeight: 1.15,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.segment.title}
          </span>
          <SplitShiftBadge inverse label={`Shift ${item.segmentIndex + 1}`} />
        </div>
        {timeRange || timing ? (
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, gap: 3 }}>
            {timeRange ? (
              <span
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 700,
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                {timeRange}
              </span>
            ) : null}
            {timing ? (
              <span
                style={{
                  color: "rgba(255,255,255,0.78)",
                  fontSize: 13,
                  fontWeight: 700,
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                {timing.label}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {item.segment.focusAreaName ? (
        <HeroInfoRow icon={<MapPin size={18} />} text={item.segment.focusAreaName} />
      ) : null}
      <HeroPillRow segment={item.segment} inverse />
    </div>
  );
}

function ShiftmatesRow({
  inverse = false,
  items,
}: {
  inverse?: boolean;
  items: DashboardScheduleItem[];
}) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";

  if (items.length === 0) {
    return null;
  }

  const visibleItems = items.slice(0, 3);
  const overflowCount = items.length - visibleItems.length;
  const collaboratorBackground = inverse
    ? isDarkTheme
      ? DASHBOARD_HERO_COLLABORATOR_BG_DARK
      : DASHBOARD_HERO_COLLABORATOR_BG_LIGHT
    : "var(--color-bg-secondary)";

  return (
    <div
      data-testid="user-dashboard-working-with"
      style={{
        alignItems: "center",
        background: collaboratorBackground,
        border: inverse
          ? "1px solid rgba(255,255,255,0.14)"
          : "1px solid var(--color-border-light)",
        borderRadius: 16,
        color: inverse ? "rgba(255,255,255,0.84)" : "var(--color-text-secondary)",
        display: "flex",
        gap: 10,
        justifyContent: "space-between",
        marginBottom: 6,
        marginTop: 6,
        padding: "9px 14px",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flex: 1,
          gap: 9,
          minWidth: 0,
        }}
      >
        <Users color={inverse ? "rgba(255,255,255,0.76)" : undefined} size={22} />
        <span
          style={{
            flexShrink: 1,
            fontSize: 15,
            fontWeight: 600,
            lineHeight: "21px",
          }}
        >
          Working with
        </span>
      </div>
      <div
        data-testid="user-dashboard-shiftmate-avatar-stack"
        style={{
          alignItems: "center",
          display: "flex",
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {visibleItems.map((item, index) => {
          const avatarTone = getAvatarTone(item.employeeId, isDarkTheme);

          return (
            <span
              key={item.employeeId}
              data-testid="user-dashboard-shiftmate-avatar-frame"
              title={item.employeeName}
              style={{
                background: collaboratorBackground,
                borderRadius: 999,
                display: "inline-flex",
                flexShrink: 0,
                height: 42,
                marginLeft: index === 0 ? 0 : DASHBOARD_HERO_AVATAR_OVERLAP,
                padding: 2,
                width: 42,
              }}
            >
              <span
                data-testid="user-dashboard-shiftmate-avatar"
                style={{
                  alignItems: "center",
                  background: avatarTone.backgroundColor,
                  border: `1px solid ${avatarTone.borderColor}`,
                  borderRadius: 19,
                  color: avatarTone.textColor,
                  display: "inline-flex",
                  fontSize: 13,
                  fontWeight: 600,
                  height: 38,
                  justifyContent: "center",
                  lineHeight: "18px",
                  width: 38,
                }}
              >
                {getAvatarInitials(item.employeeName)}
              </span>
            </span>
          );
        })}
        {overflowCount > 0 ? (
          <span
            data-testid="user-dashboard-shiftmate-overflow-frame"
            style={{
              alignItems: "center",
              background: collaboratorBackground,
              borderRadius: 999,
              display: "inline-flex",
              flexShrink: 0,
              height: 42,
              marginLeft: visibleItems.length > 0 ? DASHBOARD_HERO_AVATAR_OVERLAP : 0,
              padding: 2,
              width: 42,
            }}
          >
            <span
              data-testid="user-dashboard-shiftmate-overflow"
              style={{
                alignItems: "center",
                background: "#DBEAFE",
                border: "1px solid #93C5FD",
                borderRadius: 19,
                color: "#1D4ED8",
                display: "inline-flex",
                fontSize: 14,
                fontWeight: 600,
                height: 38,
                justifyContent: "center",
                width: 38,
              }}
            >
              +{overflowCount}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CoverRequestsSection({
  requests,
  style,
}: {
  requests: ShiftRequest[];
  style?: CSSProperties;
}) {
  return (
    <section
      className="dg-card"
      data-testid="user-dashboard-cover-requests"
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        ...style,
      }}
    >
      <SectionHeader
        subtitle={
          requests.length > 0
            ? `${requests.length} request${requests.length === 1 ? "" : "s"} needing a response`
            : "No cover requests right now"
        }
        title="Cover requests"
      />
      <div
        className="dg-card-body"
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
          padding: "16px 18px",
        }}
      >
        {requests.length === 0 ? (
          <EmptyState
            size="inline"
            icon={<Check size={20} />}
            title="All caught up"
            description="Requests for your shifts will appear here."
          />
        ) : (
          <SummaryMetricPanel
            body="Awaiting your response."
            label="Need response"
            value={requests.length}
          />
        )}
      </div>
    </section>
  );
}

function AvailableShiftsSection({
  isTwoWeekView = false,
  items,
  style,
}: {
  isTwoWeekView?: boolean;
  items: AvailableShiftItem[];
  style?: CSSProperties;
}) {
  const pickupCount = items.filter((item) => item.kind === "pickup").length;
  const coverageCount = items.length - pickupCount;
  const periodLabel = isTwoWeekView ? "these 2 weeks" : "this week";
  const summaryParts = [
    pickupCount > 0 ? `${pickupCount} pickup${pickupCount === 1 ? "" : "s"}` : null,
    coverageCount > 0 ? `${coverageCount} coverage gap${coverageCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <section
      className="dg-card"
      data-testid="user-dashboard-available-shifts"
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        ...style,
      }}
    >
      <SectionHeader
        subtitle={
          items.length > 0
            ? `${items.length} available ${periodLabel}`
            : `Nothing available ${periodLabel}`
        }
        title="Available shifts"
      />
      <div
        className="dg-card-body"
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
          padding: "16px 18px",
        }}
      >
        {items.length === 0 ? (
          <EmptyState
            size="inline"
            icon={<CalendarDays size={20} />}
            title="No open shifts"
            description="Available pickups and coverage gaps will appear here."
          />
        ) : (
          <SummaryMetricPanel
            body={summaryParts.length > 0 ? summaryParts.join(" · ") : "Upcoming open shifts"}
            label="Available upcoming"
            value={items.length}
          />
        )}
      </div>
    </section>
  );
}

function ActionRailSection({
  currentEmpId,
  items,
  onClaim,
  onRespond,
  onVolunteer,
  scrollable = false,
  shiftById,
  style,
}: {
  currentEmpId: string;
  items: DashboardActionItem[];
  onClaim: (requestId: string, empId: string) => Promise<boolean>;
  onRespond: (requestId: string, empId: string, accept: boolean) => Promise<boolean>;
  onVolunteer: (
    empId: string,
    shiftDate: string,
    input: ScheduleCellInput,
    focusAreaId: number,
  ) => Promise<boolean>;
  scrollable?: boolean;
  shiftById: Map<number, { abbr?: string | null; name: string }>;
  style?: CSSProperties;
}) {
  return (
    <section
      data-testid="user-dashboard-action-rail-section"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 0,
        minWidth: 0,
        overflow: scrollable ? "hidden" : undefined,
        ...style,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          paddingLeft: scrollable ? PANE_SCROLL_GUTTER : undefined,
          paddingRight: scrollable ? PANE_SCROLL_GUTTER : undefined,
        }}
      >
        <div className="dg-card-title">Open shifts &amp; requests</div>
        <div className="dg-card-subtitle">
          {items.length > 0
            ? `${items.length} upcoming item${items.length === 1 ? "" : "s"}`
            : "No upcoming open shifts or requests"}
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState
          size="inline"
          icon={<Check size={20} />}
          title="All caught up"
          description="Open shifts and cover requests will appear here."
        />
      ) : (
        <div
          aria-label="Upcoming open shifts and requests"
          className={scrollable ? "dg-no-scrollbar" : undefined}
          data-testid="user-dashboard-action-rail"
          role="list"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minHeight: 0,
            minWidth: 0,
            overflowY: scrollable ? "auto" : undefined,
            paddingBottom: scrollable ? PANE_SCROLL_PADDING : undefined,
            paddingLeft: scrollable ? PANE_SCROLL_GUTTER : undefined,
            paddingRight: scrollable ? PANE_SCROLL_GUTTER : undefined,
            scrollbarWidth: scrollable ? "none" : undefined,
          }}
        >
          {items.map((item) =>
            item.kind === "request" ? (
              <RequestActionCard
                key={item.id}
                currentEmpId={currentEmpId}
                date={item.date}
                request={item.request}
                onRespond={onRespond}
                shiftById={shiftById}
              />
            ) : (
              <AvailableShiftActionCard
                key={item.id}
                currentEmpId={currentEmpId}
                item={item.item}
                onClaim={onClaim}
                onVolunteer={onVolunteer}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function MyWeekSection({
  items,
  isTwoWeekView = false,
  style,
  todayKey,
  weeklyHours,
}: {
  items: DashboardScheduleItem[];
  isTwoWeekView?: boolean;
  style?: CSSProperties;
  todayKey: string;
  weeklyHours: number;
}) {
  const groups = groupScheduleItemsByDate(items);
  const periodLabel = isTwoWeekView ? "these 2 weeks" : "this week";
  const hoursLabel = weeklyHours > 0 ? `${formatHoursValue(weeklyHours)}h ${periodLabel}` : null;

  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="dg-card" data-testid="user-dashboard-my-week" style={style}>
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">{isTwoWeekView ? "Your Schedule" : "Your Week"}</div>
          <div className="dg-card-subtitle">
            {hoursLabel ?? `Your published shifts for ${periodLabel}`}
          </div>
        </div>
      </div>
      <div className="dg-card-body" style={{ padding: 0 }}>
        {groups.map((group, index) => {
          const isToday = group.dateKey === todayKey;
          return (
            <div
              key={group.dateKey}
              data-testid={isToday ? "user-dashboard-my-week-today" : undefined}
              style={{
                background: isToday ? "var(--color-brand-bg)" : "transparent",
                borderBottom:
                  index < groups.length - 1 ? "1px solid var(--color-border-light)" : "none",
                display: "grid",
                gap: 14,
                gridTemplateColumns: "72px minmax(0, 1fr)",
                padding: "16px 18px",
              }}
            >
              <DateTile date={group.date} isToday={isToday} />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: group.items.length > 1 ? 12 : 0,
                  minWidth: 0,
                }}
              >
                {group.items.map((item, itemIndex) => (
                  <div key={item.key}>
                    {itemIndex > 0 ? <DashedDivider /> : null}
                    <WeekShiftRow item={item} showSegmentLabel={group.items.length > 1} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SectionHeader({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <div className="dg-card-header">
      <div>
        <div className="dg-card-title">{title}</div>
        <div className="dg-card-subtitle">{subtitle}</div>
      </div>
    </div>
  );
}

function SummaryMetricPanel({
  body,
  label,
  value,
}: {
  body: string;
  label: string;
  value: number;
}) {
  return (
    <div
      data-testid="user-dashboard-summary-panel"
      style={{
        alignItems: "flex-start",
        background: "var(--color-bg)",
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--dg-radius-md)",
        display: "flex",
        gap: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "var(--color-brand-bg)",
          border: "1px solid var(--color-brand-border)",
          borderRadius: 12,
          color: "var(--color-brand)",
          display: "flex",
          flexShrink: 0,
          fontSize: 22,
          fontWeight: 780,
          height: 52,
          justifyContent: "center",
          lineHeight: 1,
          width: 52,
        }}
      >
        {value}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "var(--color-text-primary)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {label}
        </div>
        <div
          style={{
            color: "var(--color-text-muted)",
            fontSize: 12,
            lineHeight: 1.4,
            marginTop: 3,
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

function ActionCardShell({
  actions,
  date,
  eyebrow,
  subtitle,
  title,
}: {
  actions: ReactNode;
  date: Date;
  eyebrow: string;
  subtitle: string;
  title: string;
}) {
  return (
    <article
      role="listitem"
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--dg-radius-lg)",
        boxShadow: "var(--shadow-sm)",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        gap: 14,
        padding: 16,
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          gap: 12,
          minWidth: 0,
        }}
      >
        <DateTile compact date={date} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: "var(--color-text-muted)",
              fontSize: 11,
              fontWeight: 750,
              letterSpacing: 0,
              lineHeight: 1.2,
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              color: "var(--color-text-primary)",
              fontSize: 15,
              fontWeight: 760,
              lineHeight: 1.25,
              overflowWrap: "anywhere",
            }}
          >
            {title}
          </div>
          <div
            style={{
              color: "var(--color-text-muted)",
              fontSize: 12,
              lineHeight: 1.4,
              marginTop: 5,
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: "auto",
        }}
      >
        {actions}
      </div>
    </article>
  );
}

function RequestActionCard({
  currentEmpId,
  date,
  onRespond,
  request,
  shiftById,
}: {
  currentEmpId: string;
  date: Date;
  onRespond: (requestId: string, empId: string, accept: boolean) => Promise<boolean>;
  request: ShiftRequest;
  shiftById: Map<number, { abbr?: string | null; name: string }>;
}) {
  const title =
    request.type === "swap" && request.targetName
      ? `${request.requesterName} wants to swap`
      : `${request.requesterName} requested coverage`;
  const subtitle = [formatRequestShiftLabel(request, shiftById), formatRequestTimeRange(request)]
    .filter(Boolean)
    .join(" · ");

  return (
    <ActionCardShell
      actions={
        <>
          <AsyncActionButton
            label="Accept"
            onClick={() => onRespond(request.id, currentEmpId, true)}
            variant="primary"
          />
          <AsyncActionButton
            label="Decline"
            onClick={() => onRespond(request.id, currentEmpId, false)}
            variant="secondary"
          />
        </>
      }
      date={date}
      eyebrow="Request"
      subtitle={subtitle || "Coverage request"}
      title={title}
    />
  );
}

function AvailableShiftActionCard({
  currentEmpId,
  item,
  onClaim,
  onVolunteer,
}: {
  currentEmpId: string;
  item: AvailableShiftItem;
  onClaim: (requestId: string, empId: string) => Promise<boolean>;
  onVolunteer: (
    empId: string,
    shiftDate: string,
    input: ScheduleCellInput,
    focusAreaId: number,
  ) => Promise<boolean>;
}) {
  const volunteerInput =
    item.kind === "coverage"
      ? buildVolunteerInput(item.assignment, item.openShift.focusAreaId)
      : null;

  return (
    <ActionCardShell
      actions={
        item.kind === "pickup" ? (
          <AsyncActionButton
            label="Claim"
            onClick={() => onClaim(item.request.id, currentEmpId)}
            variant="primary"
          />
        ) : (
          <AsyncActionButton
            disabled={!volunteerInput}
            label="Volunteer"
            onClick={() =>
              volunteerInput
                ? onVolunteer(
                    currentEmpId,
                    item.dateKey,
                    volunteerInput,
                    item.openShift.focusAreaId,
                  )
                : Promise.resolve(false)
            }
            variant="primary"
          />
        )
      }
      date={item.date}
      eyebrow={item.kind === "pickup" ? "Pickup" : "Open shift"}
      subtitle={[item.subtitle, item.timeRange].filter(Boolean).join(" · ")}
      title={item.title}
    />
  );
}

function WeekShiftRow({
  item,
  showSegmentLabel = false,
}: {
  item: DashboardScheduleItem;
  showSegmentLabel?: boolean;
}) {
  const timeRange = formatSegmentTimeRange(item.segment);
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: 12,
        minWidth: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              minWidth: 0,
            }}
          >
            <div
              style={{
                color: "var(--color-text-primary)",
                fontSize: 15,
                fontWeight: 750,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.segment.isAbsence
                ? (item.segment.typeLabel ?? item.segment.title)
                : item.segment.title}
            </div>
            {showSegmentLabel && !item.segment.isAbsence ? (
              <SplitShiftBadge label={`Shift ${item.segmentIndex + 1}`} />
            ) : null}
          </div>
          {timeRange ? (
            <div
              style={{
                alignItems: "center",
                color: "var(--color-text-muted)",
                display: "flex",
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 650,
                gap: 5,
              }}
            >
              <Clock3 size={15} />
              {timeRange}
            </div>
          ) : null}
        </div>
        {item.segment.focusAreaName ? (
          <div
            style={{
              color: "var(--color-text-muted)",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            {item.segment.focusAreaName}
          </div>
        ) : null}
        <WeekPillRow segment={item.segment} />
      </div>
    </div>
  );
}

function WeekPillRow({ segment }: { segment: DashboardScheduleSegment }) {
  // Absence rows show "Absence" as the title above (see WeekShiftRow) and always
  // pair it with the specific colored pill (e.g. "Sick") below, matching the
  // mobile app's Absence-eyebrow-then-pill treatment.
  const showShiftPill = segment.isAbsence || shouldShowShiftPill(segment);

  if (!showShiftPill && !segment.isMentored) {
    return null;
  }

  return (
    <div
      data-testid="user-dashboard-week-pills"
      style={{
        alignItems: "center",
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 8,
      }}
    >
      {showShiftPill ? <ShiftPill segment={segment} /> : null}
      {segment.isMentored ? <MentoredPill /> : null}
    </div>
  );
}

function shouldShowShiftPill(segment: DashboardScheduleSegment): boolean {
  const chipLabel = normalizeDisplayLabel(segment.chipLabel);
  if (!chipLabel) {
    return false;
  }

  return (
    chipLabel !== normalizeDisplayLabel(segment.title) &&
    chipLabel !== normalizeDisplayLabel(segment.typeLabel)
  );
}

function normalizeDisplayLabel(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function AsyncActionButton({
  disabled = false,
  label,
  onClick,
  variant,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => Promise<unknown>;
  variant: "primary" | "secondary";
}) {
  const [isRunning, setIsRunning] = useState(false);
  const isDisabled = disabled || isRunning;

  return (
    <button
      className={variant === "primary" ? "dg-btn dg-btn-brand" : "dg-btn dg-btn-secondary"}
      disabled={isDisabled}
      onClick={() => {
        if (isDisabled) {
          return;
        }
        setIsRunning(true);
        void onClick().finally(() => setIsRunning(false));
      }}
      style={{
        height: 30,
        padding: "0 10px",
        whiteSpace: "nowrap",
      }}
      type="button"
    >
      {isRunning ? "Working" : label}
    </button>
  );
}

function DateTile({
  compact = false,
  date,
  isToday = false,
}: {
  compact?: boolean;
  date: Date;
  isToday?: boolean;
}) {
  const parts = getDateParts(date);
  const tileSizeStyle = compact
    ? {
        minWidth: 46,
        padding: "6px 8px",
      }
    : {
        height: 68,
        width: 60,
      };

  return (
    <div
      aria-label={parts.fullLabel}
      data-testid={isToday ? "user-dashboard-date-tile-today" : undefined}
      style={{
        alignSelf: compact ? undefined : "center",
        alignItems: "center",
        background: compact ? "var(--color-bg)" : "var(--color-bg-secondary)",
        border: compact ? "1px solid var(--color-border)" : "1px solid var(--color-border-light)",
        borderRadius: compact ? 10 : 16,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        gap: compact ? 0 : 6,
        justifyContent: "center",
        ...tileSizeStyle,
      }}
    >
      <span
        style={{
          color: compact ? "var(--color-text-muted)" : "var(--color-text-subtle)",
          fontSize: compact ? 10 : 11,
          fontWeight: 750,
          textTransform: "uppercase",
        }}
      >
        {parts.weekday}
      </span>
      <span
        style={{
          color: compact ? "var(--color-text-primary)" : "var(--color-text-secondary)",
          fontSize: compact ? 17 : 20,
          fontWeight: 800,
          lineHeight: compact ? 1 : "24px",
        }}
      >
        {parts.day}
      </span>
      {isToday && !compact ? (
        <span
          aria-hidden
          data-testid="user-dashboard-date-tile-today-dot"
          style={{
            background: "var(--color-danger)",
            borderRadius: 999,
            height: 5,
            marginTop: 1,
            width: 5,
          }}
        />
      ) : null}
    </div>
  );
}

function DashedDivider() {
  return (
    <div
      aria-hidden
      style={{
        borderTop: "1px dashed var(--color-border)",
        height: 1,
        margin: "0 0 12px",
      }}
    />
  );
}

function groupScheduleItemsByDate(items: DashboardScheduleItem[]) {
  return items.reduce<Array<{ date: Date; dateKey: string; items: DashboardScheduleItem[] }>>(
    (groups, item) => {
      const group = groups[groups.length - 1];
      if (group?.dateKey === item.dateKey) {
        group.items.push(item);
        return groups;
      }

      groups.push({ date: item.date, dateKey: item.dateKey, items: [item] });
      return groups;
    },
    [],
  );
}

function buildVolunteerInput(
  assignment: AssignmentDefinition | null,
  focusAreaId: number,
): ScheduleCellInput | null {
  if (!assignment?.jobId) {
    return null;
  }

  return {
    absenceTypeId: null,
    customEndTime: null,
    customStartTime: null,
    focusAreaId,
    fromRecurring: false,
    kind: "worked",
    segments: [
      {
        isMentored: false,
        jobId: assignment.jobId,
        position: 0,
        shiftId: assignment.shiftId ?? assignment.categoryId ?? null,
      },
    ],
    seriesId: null,
  };
}

function formatSegmentTimeRange(segment: DashboardScheduleSegment): string | null {
  return segment.startTime && segment.endTime
    ? `${formatTime12h(segment.startTime)} - ${formatTime12h(segment.endTime)}`
    : null;
}

function formatAssignmentTimeRange(assignment: AssignmentDefinition | null): string | null {
  return assignment?.defaultStartTime && assignment.defaultEndTime
    ? `${formatTime12h(assignment.defaultStartTime)} - ${formatTime12h(assignment.defaultEndTime)}`
    : null;
}

function formatOpenShiftTitle(
  openShift: DashboardContentProps["openShifts"][number],
  assignment: AssignmentDefinition | null,
  shiftById: Map<number, { abbr?: string | null; name: string }>,
): string {
  const shiftId = assignment?.shiftId ?? assignment?.categoryId ?? null;
  const shift = shiftId != null ? (shiftById.get(shiftId) ?? null) : null;
  const assignmentJobName = getAssignmentJobName(assignment, shift?.name ?? null);

  return expandShiftDisplayLabel({
    jobName: assignmentJobName,
    rawLabel: openShift.assignmentLabel || assignment?.label || assignment?.name || "Open shift",
    shiftAbbr: shift?.abbr ?? null,
    shiftName: shift?.name ?? null,
  });
}

function formatRequestTimeRange(request: ShiftRequest): string | null {
  const start = getRequestStartTime(request);
  const end =
    request.requesterCustomEndTime ??
    request.requesterPresentation?.segments?.[0]?.endTime ??
    request.requesterSegments?.[0]?.endTime ??
    null;

  return start !== "99:99:99" && end ? `${formatTime12h(start)} - ${formatTime12h(end)}` : null;
}

function getRequestStartTime(request: ShiftRequest): string {
  return (
    request.requesterCustomStartTime ??
    request.requesterPresentation?.segments?.[0]?.startTime ??
    request.requesterSegments?.[0]?.startTime ??
    "99:99:99"
  );
}

function formatRequestShiftLabel(
  request: ShiftRequest,
  shiftById: Map<number, { abbr?: string | null; name: string }>,
): string {
  const segment =
    request.requesterPresentation?.segments?.[0] ?? request.requesterSegments?.[0] ?? null;
  const shiftId =
    segment?.shiftId ??
    request.requesterShiftIds?.[0] ??
    request.requesterState.segments?.[0]?.shiftId ??
    null;
  const shift = shiftId != null ? (shiftById.get(shiftId) ?? null) : null;

  return expandShiftDisplayLabel({
    jobName: segment?.jobName ?? null,
    rawLabel: request.requesterShiftLabel,
    shiftAbbr: shift?.abbr ?? null,
    shiftName: segment?.shiftName ?? shift?.name ?? null,
  });
}

function formatRequestSubtitle(
  request: ShiftRequest,
  shiftById: Map<number, { abbr?: string | null; name: string }>,
): string {
  return [request.requesterName, formatRequestShiftLabel(request, shiftById)]
    .filter(Boolean)
    .join(" · ");
}

function getAssignmentJobName(
  assignment: AssignmentDefinition | null,
  shiftName: string | null,
): string | null {
  const assignmentName = assignment?.name?.trim();
  const normalizedShiftName = shiftName?.trim();
  if (!assignmentName || !normalizedShiftName) {
    return null;
  }

  if (labelsEqual(assignmentName, normalizedShiftName)) {
    return null;
  }

  if (assignmentName.toLowerCase().startsWith(normalizedShiftName.toLowerCase())) {
    return assignmentName.slice(normalizedShiftName.length).trim() || null;
  }

  return assignmentName;
}

function formatTime12h(time: string): string {
  const [hoursValue, minutesValue] = time.split(":").map(Number);
  const period = hoursValue >= 12 ? "PM" : "AM";
  const hours = hoursValue === 0 ? 12 : hoursValue > 12 ? hoursValue - 12 : hoursValue;
  const minutes = Number.isFinite(minutesValue) ? minutesValue : 0;
  return `${hours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function getDateParts(date: Date): {
  day: number;
  fullLabel: string;
  month: string;
  weekday: string;
} {
  return {
    day: date.getDate(),
    fullLabel: new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
    }).format(date),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
    weekday: DAY_NAMES[date.getDay()],
  };
}

function getHeroStatusLabel(status: HeroStatus): string {
  if (status === "active") return "On Duty";
  if (status === "away") return "Away";
  if (status === "upcoming") return "Upcoming";
  if (status === "scheduled") return "Scheduled";
  return "Scheduled";
}

function formatEmployeeName(employee: Employee): string {
  return `${employee.firstName} ${employee.lastName}`.trim() || "Staff";
}

function formatHoursValue(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
