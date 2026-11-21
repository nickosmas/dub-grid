import type { MobileShiftRequest } from "@dubgrid/contracts";
import {
  describeRequestForViewer,
  formatScheduleDayLabel,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryCategoryKey,
} from "@dubgrid/schedule-core";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, type MobileColors } from "../../../shared/theme/tokens";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useDayRoster } from "../hooks/useDayRoster";
import { PaneTitle } from "../../../shared/layout/PaneTitle";
import { REQUEST_TYPE_LABEL } from "../lib/request-type";
import { buildRequestResolvers } from "../lib/request-resolvers";
import { RequestListSection } from "./RequestListSection";

const askedFormatter = (timeZone: string | null | undefined) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : null),
  });

/**
 * What the request's card in the list beside it doesn't say: what answering
 * it does (the web's words, from the request itself), when it was asked, and
 * who works that day. The split view's right pane on an open iPhone Duo; the
 * card itself, answers included, stays in the list.
 */
export function RequestDetail({
  request,
  viewerEmpId,
  now,
  timeZone,
}: {
  request: MobileShiftRequest;
  viewerEmpId: string | null;
  now: Date;
  timeZone: string | null | undefined;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const bootstrap = useBootstrap(accessToken).data;
  const text = useMemo(() => {
    const formatter = askedFormatter(timeZone);
    return describeRequestForViewer({
      request,
      viewerEmpId,
      resolvers: buildRequestResolvers(request, bootstrap),
      formatAsked: (date) => formatter.format(date),
    });
  }, [request, viewerEmpId, bootstrap, timeZone]);
  const days = useMemo(() => requestDays(request), [request]);

  return (
    <View style={styles.page}>
      <PaneTitle title={REQUEST_TYPE_LABEL[request.type]} />
      {text ? (
        <View style={styles.outcome}>
          {text.body ? <AppText variant="body">{text.body}</AppText> : null}
          <AppText tone="secondary" variant="meta">
            {text.asked}
          </AppText>
        </View>
      ) : null}
      {days.map((day) => (
        <RosterDay
          date={day.date}
          key={day.date}
          now={now}
          shifts={day.shifts}
          timeZone={timeZone}
        />
      ))}
    </View>
  );
}

/**
 * Each day the request touches and the shift on it the request is about: the
 * asker's on their date, the other person's on theirs (both when it's one day).
 */
function requestDays(request: MobileShiftRequest): { date: string; shifts: ReadonlySet<string> }[] {
  const days = new Map<string, Set<string>>();
  const add = (
    date: string | null,
    state: MobileShiftRequest["requesterState"] | null | undefined,
    presentation: MobileShiftRequest["requesterPresentation"] | null | undefined,
  ) => {
    if (!date || !state || !presentation) return;
    const shifts = days.get(date) ?? new Set<string>();
    days.set(date, shifts);
    const cell = { state, presentation } as Parameters<typeof getScheduleEntryCategoryKey>[0];
    if (getScheduleEntryAbsenceTypeId(cell) == null) shifts.add(getScheduleEntryCategoryKey(cell));
  };
  add(request.requesterShiftDate, request.requesterState, request.requesterPresentation);
  add(request.targetShiftDate, request.targetState, request.targetPresentation);
  return [...days].map(([date, shifts]) => ({ date, shifts }));
}

/** The shifts the request is about on one day, with everyone working them now. */
function RosterDay({
  date,
  shifts,
  now,
  timeZone,
}: {
  date: string;
  shifts: ReadonlySet<string>;
  now: Date;
  timeZone: string | null | undefined;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const roster = useDayRoster(date, shifts);
  if (!roster.shifts || roster.shifts.length === 0) return null;

  return (
    <RequestListSection title={`Working ${formatScheduleDayLabel(date, now, timeZone)}`}>
      <View style={styles.roster}>
        {roster.shifts.map((shift, index) => (
          <View key={shift.key} style={[styles.rosterRow, index > 0 && styles.rosterRowDivider]}>
            <AppText variant="rowTitle">
              {[shift.title, shift.focusArea, shift.time].filter(Boolean).join(" · ")}
            </AppText>
            {shift.people.map((person, personIndex) => (
              <AppText key={`${person.employeeId}-${personIndex}`} tone="secondary" variant="body">
                {person.name}
              </AppText>
            ))}
          </View>
        ))}
      </View>
    </RequestListSection>
  );
}

function createStyles(mobileColors: MobileColors) {
  return StyleSheet.create({
    page: {
      gap: mobileSpace.lg,
    },
    outcome: {
      gap: mobileSpace.xs,
      backgroundColor: mobileColors.brandSoft,
      borderRadius: mobileRadii.control,
      padding: mobileSpace.lg,
    },
    roster: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      overflow: "hidden",
    },
    rosterRow: {
      gap: mobileSpace.xs,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
    },
    rosterRowDivider: {
      borderTopColor: mobileColors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
  });
}
