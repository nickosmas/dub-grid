import { getIsoDateInTimeZone, getScheduleRangeForDate } from "@dubgrid/schedule-core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { getOrgSchedule } from "../../../shared/lib/api";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileRadii,
  mobileSpace,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { ProfileList, ProfileSection } from "../../profile/components/ProfilePrimitives";
import { buildPersonWeek, buildWorkingWithYou } from "../lib/person-week";

/**
 * A person's week on their page: the days you share a shift with them, then
 * their shift each day. From the team schedule, so someone who can't see it
 * gets neither.
 */
export function PersonWeek({ personId }: { personId: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const bootstrap = useBootstrap(accessToken).data;
  const now = useRealtimeNow();
  const today = getIsoDateInTimeZone(now, bootstrap?.currentOrg.timezone);
  const range = useMemo(() => getScheduleRangeForDate(today), [today]);
  const canViewSchedule = Boolean(bootstrap?.permissions.canViewSchedule);
  const viewerId = bootstrap?.linkedEmployee?.id ?? null;
  const query = useQuery({
    queryKey: mobileQueryKeys.schedule(accessToken, "team", range),
    queryFn: ({ signal }) => getOrgSchedule(accessToken!, range, signal),
    enabled: Boolean(accessToken) && canViewSchedule,
  });
  const entries = query.data?.entries;
  const week = useMemo(
    () => (entries ? buildPersonWeek(entries, personId, range.startDate) : null),
    [entries, personId, range.startDate],
  );
  const workingWith = useMemo(
    () =>
      entries && viewerId
        ? buildWorkingWithYou(entries, { personId, viewerId, weekStart: range.startDate })
        : [],
    [entries, personId, viewerId, range.startDate],
  );

  if (!canViewSchedule || !week) return null;

  return (
    <>
      {workingWith.length > 0 ? (
        <View style={styles.together}>
          <AppText style={styles.brandText} variant="meta">
            Working with you this week
          </AppText>
          <AppText variant="body">{workingWith.join(", ")}</AppText>
        </View>
      ) : null}
      <ProfileSection title="This week">
        <ProfileList>
          {week.map((day, index) => (
            <View
              key={day.date}
              accessibilityLabel={`${day.label}, ${day.shift ?? "off"}`}
              accessible
              style={[styles.row, index > 0 && styles.rowDivider]}
            >
              <AppText
                style={day.date === today ? styles.today : undefined}
                tone={day.shift ? "primary" : "secondary"}
                variant="body"
              >
                {day.label}
              </AppText>
              <AppText
                align="right"
                style={styles.shift}
                tone={day.shift ? "secondary" : "subtle"}
                variant="meta"
              >
                {day.shift ?? "Off"}
              </AppText>
            </View>
          ))}
        </ProfileList>
      </ProfileSection>
    </>
  );
}

function createStyles(mobileColors: MobileColors) {
  return StyleSheet.create({
    together: {
      backgroundColor: mobileColors.brandSoft,
      borderRadius: mobileRadii.control,
      gap: mobileSpace.xs,
      padding: mobileSpace.lg,
    },
    brandText: {
      color: mobileColors.brand,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      minHeight: mobileListRow.minHeight,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
    },
    rowDivider: {
      borderTopColor: mobileColors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    today: {
      color: mobileColors.brand,
    },
    shift: {
      flex: 1,
    },
  });
}
