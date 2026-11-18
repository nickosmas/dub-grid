import type { MobileShiftRequest } from "@dubgrid/contracts";
import { describeRequestForViewer, formatScheduleDayLabel } from "@dubgrid/schedule-core";
import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, type MobileColors } from "../../../shared/theme/tokens";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useDayRoster } from "../hooks/useDayRoster";
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
 * A whole request: its card with the answers, what answering it does (the
 * web's words, from the request itself) and who works that day. The split
 * view's right pane on an open iPhone Duo.
 */
export function RequestDetail({
  request,
  card,
  viewerEmpId,
  now,
  timeZone,
}: {
  request: MobileShiftRequest;
  /** The list's own card for this request, answers included. */
  card: ReactNode;
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
  const roster = useDayRoster(request.requesterShiftDate);

  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <AppText tone="secondary" variant="meta">
          Request
        </AppText>
        <AppText accessibilityRole="header" variant="screenTitle">
          {REQUEST_TYPE_LABEL[request.type]}
        </AppText>
      </View>
      {card}
      {text?.body ? (
        <View style={styles.outcome}>
          <AppText variant="body">{text.body}</AppText>
        </View>
      ) : null}
      {roster.shifts && roster.shifts.length > 0 ? (
        <RequestListSection
          title={`Working ${formatScheduleDayLabel(request.requesterShiftDate, now, timeZone)}`}
        >
          <View style={styles.roster}>
            {roster.shifts.map((shift, index) => (
              <View
                key={shift.key}
                style={[styles.rosterRow, index > 0 && styles.rosterRowDivider]}
              >
                <AppText variant="rowTitle">
                  {[shift.title, shift.focusArea, shift.time].filter(Boolean).join(" · ")}
                </AppText>
                <AppText tone="secondary" variant="meta">
                  {shift.names.join(", ")}
                </AppText>
              </View>
            ))}
          </View>
        </RequestListSection>
      ) : null}
    </View>
  );
}

function createStyles(mobileColors: MobileColors) {
  return StyleSheet.create({
    page: {
      gap: mobileSpace.lg,
      paddingTop: mobileSpace.lg,
    },
    heading: {
      gap: mobileSpace.xs,
    },
    outcome: {
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
