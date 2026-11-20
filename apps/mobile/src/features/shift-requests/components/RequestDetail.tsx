import type { MobileShiftRequest } from "@dubgrid/contracts";
import { splitSelectedRowStyle } from "../../../shared/layout/splitSelection";
import { describeRequestForViewer, formatScheduleDayLabel } from "@dubgrid/schedule-core";
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
  const affectedIds = useMemo(
    () =>
      new Set(
        [request.requesterEmpId, request.targetEmpId].filter((id): id is string => id != null),
      ),
    [request.requesterEmpId, request.targetEmpId],
  );
  const dates = [
    request.requesterShiftDate,
    ...(request.targetShiftDate && request.targetShiftDate !== request.requesterShiftDate
      ? [request.targetShiftDate]
      : []),
  ];

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
      {dates.map((date) => (
        <RosterDay affectedIds={affectedIds} date={date} key={date} now={now} timeZone={timeZone} />
      ))}
    </View>
  );
}

/** Who works one day the request touches, its people and their shifts marked. */
function RosterDay({
  date,
  affectedIds,
  now,
  timeZone,
}: {
  date: string;
  affectedIds: ReadonlySet<string>;
  now: Date;
  timeZone: string | null | undefined;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const roster = useDayRoster(date, affectedIds);
  if (!roster.shifts || roster.shifts.length === 0) return null;

  return (
    <RequestListSection title={`Working ${formatScheduleDayLabel(date, now, timeZone)}`}>
      <View style={styles.roster}>
        {roster.shifts.map((shift, index) => (
          <View
            key={shift.key}
            style={[
              styles.rosterRow,
              index > 0 && styles.rosterRowDivider,
              shift.affected && styles.rosterRowAffected,
            ]}
          >
            <AppText variant="rowTitle">
              {[shift.title, shift.focusArea, shift.time].filter(Boolean).join(" · ")}
            </AppText>
            {shift.people.map((person, personIndex) => (
              <AppText
                key={`${person.employeeId}-${personIndex}`}
                tone={person.affected ? "brand" : "secondary"}
                variant={person.affected ? "rowTitle" : "body"}
              >
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
    // The same clear blue as a split list's picked row.
    rosterRowAffected: splitSelectedRowStyle(mobileColors),
    rosterRowDivider: {
      borderTopColor: mobileColors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
  });
}
