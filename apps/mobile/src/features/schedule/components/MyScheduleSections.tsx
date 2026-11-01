import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ScheduleNoteLabels } from "../../../shared/components/ScheduleNoteLabels";
import { scheduleNotesForRow, scheduleNotesForSegment } from "../lib/scheduleNotes";
import { Fragment, useEffect, useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { AnimatedMeterFill } from "../../../shared/motion/AnimatedMeterFill";
import { Pressable } from "../../../shared/components/Pressable";
import { PressableRow } from "../../../shared/components/PressableRow";
import { SectionHeading } from "../../../shared/components/SectionHeading";
import { LinearGradient } from "expo-linear-gradient";
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { NumericBadge } from "../../../shared/components/NumericBadge";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import { CardActionRows } from "./CardActionRows";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { ScheduleDateTile } from "./ScheduleDateTile";
import type {
  PendingRequestAction,
  RequestActionBody,
} from "../../shift-requests/hooks/useShiftRequestActionFlow";
import { ShiftChangeBadge, getShiftChangeLabel } from "./ShiftChangeBadge";
import { SplitShiftBadge, SplitShiftSegmentList } from "./SplitShift";
import { ShiftChangeButton } from "./ShiftChangeView";
import { getAvatarTone } from "@dubgrid/design-tokens";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { mobileOnAccent, MAX_FONT_SCALE, type MobileColors } from "../../../shared/theme/tokens";
import { useModalHandoff } from "../../../shared/hooks/useModalHandoff";
import { getMobileRequestActionKey } from "../../shift-requests/lib/request-action-feedback";
import {
  buildAvailableOpenShiftFeed,
  formatCompactScheduleDate,
  formatScheduleTimeRange,
  getCompactScheduleDateParts,
  getScheduleEntrySegments,
  getSplitShiftSegmentsForEntry,
  getSplitShiftSegmentsFromPresentation,
  isDeletedScheduleHistory,
  isGeneralScheduleEntrySegment,
  type AvailableShiftFeedItem,
  type FeaturedMeScheduleSegment,
  type MobileScheduleWeekDay,
  type WeeklyHoursSummary,
} from "../lib/schedule";
import {
  HERO_CARD_BACKGROUND_DARK,
  HERO_CARD_BACKGROUND_LIGHT,
  HERO_CARD_GRADIENT_DARK,
  HERO_CARD_GRADIENT_END,
  HERO_CARD_GRADIENT_LIGHT,
  HERO_CARD_GRADIENT_LOCATIONS,
  HERO_CARD_GRADIENT_START,
  HERO_CARD_SHADOW_DARK,
  HERO_CARD_SHADOW_LIGHT,
  HERO_COLLABORATOR_BACKGROUND_DARK,
  HERO_COLLABORATOR_BACKGROUND_LIGHT,
} from "../lib/heroCardTheme";
import {
  getSegmentStartTime,
  getSegmentEndTime,
  getHeroTiming,
  formatHoursValue,
  type HeroTiming,
} from "../lib/scheduleScreenHelpers";
import {
  buildAbsenceChip,
  buildGeneralShiftChip,
  buildJobChip,
  getMeHeroSupplementalSplitSegments,
  getRequestDateLabel,
  buildRestOfDayAbsenceChip,
  restOfDayAbsenceComesFirst,
  restOfDayAbsenceTimeLabel,
  getScheduleEntrySegmentChange,
  summariseScheduleSegment,
  type MobileScheduleSegmentChange,
  getScheduleItemFocusArea,
  getScheduleItemShiftName,
  getScheduleItemSplitShiftLabel,
  getScheduleItemTimeRange,
  getScheduleItemTypeChip,
  getSegmentJobChip,
  getVisibleScheduleItemTypeChip,
  hasMentoredSegments,
  isGeneralShiftSegment,
  shouldShowMePrimaryTitle,
  type JobChip,
} from "../lib/scheduleScreenChips";

import type {
  MobileOpenShift,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import { createStyles } from "../screens/scheduleScreenStyles";
import {
  getOpenShiftAbsenceTypeId,
  getOpenShiftFocusAreaName,
  getOpenShiftPrimarySegment,
  getOpenShiftTimeRange,
} from "../lib/openShiftPresentation";

/**
 * Shared by the two personal-scope sections that read the shift-requests query,
 * so a single failure raises a single toast rather than one from each.
 */
const SCHEDULE_REQUESTS_ERROR_TOAST_KEY = "schedule-requests-error";

function getRequestSegments(request: MobileShiftRequest, which: "requester" | "target") {
  const legacyRequest = request as MobileShiftRequest & {
    requesterSegments?: MobileShiftRequest["requesterPresentation"]["segments"];
    targetSegments?: MobileShiftRequest["requesterPresentation"]["segments"] | null;
  };

  return which === "requester"
    ? (request.requesterPresentation?.segments ?? legacyRequest.requesterSegments ?? [])
    : (request.targetPresentation?.segments ?? legacyRequest.targetSegments ?? []);
}

function getRequestPrimarySegment(request: MobileShiftRequest, which: "requester" | "target") {
  return getRequestSegments(request, which)[0] ?? null;
}

function getRequestShiftName(request: MobileShiftRequest, which: "requester" | "target"): string {
  const segment = getRequestPrimarySegment(request, which);
  if (segment?.shiftName) {
    return segment.shiftName;
  }

  return which === "requester"
    ? (request.requesterPresentation?.label ?? "Shift")
    : (request.targetPresentation?.label ?? "Shift");
}

function getRequestAbsenceTypeId(
  request: MobileShiftRequest,
  which: "requester" | "target",
): number | null {
  const state = which === "requester" ? request.requesterState : request.targetState;
  if (state?.kind === "absence") {
    return state.absenceTypeId ?? null;
  }

  return which === "requester" ? (request.absenceTypeId ?? null) : null;
}

function getRequestJobName(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string | null {
  return getRequestSegments(request, which).find((segment) => segment.jobName)?.jobName ?? null;
}

function getRequestFocusAreaName(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string | null {
  if (getRequestAbsenceTypeId(request, which) != null) {
    return null;
  }

  return (
    getRequestSegments(request, which).find(
      (segment) => !isGeneralScheduleEntrySegment(segment) && segment.displayFocusAreaName,
    )?.displayFocusAreaName ?? null
  );
}

function getRequestTimeRange(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string | null {
  const segments = getRequestSegments(request, which);
  const firstSegmentWithTime = segments.find((segment) => segment.startTime && segment.endTime);
  const lastSegmentWithTime =
    [...segments].reverse().find((segment) => segment.startTime && segment.endTime) ?? null;

  if (firstSegmentWithTime && lastSegmentWithTime) {
    return formatScheduleTimeRange(firstSegmentWithTime.startTime, lastSegmentWithTime.endTime);
  }

  if (which === "requester") {
    return formatScheduleTimeRange(
      request.requesterState?.customStartTime ?? null,
      request.requesterState?.customEndTime ?? null,
    );
  }

  return formatScheduleTimeRange(
    request.targetState?.customStartTime ?? null,
    request.targetState?.customEndTime ?? null,
  );
}

function getOpenShiftShiftName(openShift: MobileOpenShift): string {
  const primarySegment = getOpenShiftPrimarySegment(openShift);
  return primarySegment?.shiftName ?? openShift.presentation.label ?? "Open shift";
}

function getOpenShiftJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  openShift: MobileOpenShift,
): JobChip | null {
  if (getOpenShiftAbsenceTypeId(openShift) != null) {
    return buildAbsenceChip(
      mobileColors,
      isDark,
      getOpenShiftShiftName(openShift),
      openShift.presentation,
    );
  }

  const primarySegment = getOpenShiftPrimarySegment(openShift);
  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(
      mobileColors,
      isDark,
      getOpenShiftShiftName(openShift),
      primarySegment,
    );
  }

  const jobSegment = openShift.presentation.segments.find((segment) => segment.jobName);
  return buildJobChip(mobileColors, isDark, jobSegment?.jobName ?? null, jobSegment ?? null);
}

function formatOpenShiftCardCountLabel(count: number): string {
  return `${count} open shift card${count === 1 ? "" : "s"}`;
}

function getRequestJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  request: MobileShiftRequest,
  which: "requester" | "target",
): JobChip | null {
  if (getRequestAbsenceTypeId(request, which) != null) {
    const presentation =
      which === "requester" ? request.requesterPresentation : request.targetPresentation;
    return buildAbsenceChip(
      mobileColors,
      isDark,
      getRequestShiftName(request, which),
      presentation,
    );
  }

  const primarySegment = getRequestPrimarySegment(request, which);

  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(
      mobileColors,
      isDark,
      getRequestShiftName(request, which),
      primarySegment,
    );
  }

  const segment = getRequestSegments(request, which).find((item) => item.jobName) ?? null;
  const jobName = getRequestJobName(request, which);
  return buildJobChip(mobileColors, isDark, jobName, segment);
}

function MentoredPill() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View accessibilityLabel="Mentored assignment" style={styles.mentoredPill}>
      <Text fit="compact" style={styles.mentoredPillText}>
        Mentored
      </Text>
    </View>
  );
}

function MeSectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.meGroupHeading}>
      <SectionHeading
        onOpen={actionLabel ? onAction : undefined}
        title={title}
        titleStyle={styles.meSectionTitle}
      />
    </View>
  );
}

export function JobPill({
  chip,
  compact,
  eyebrowDisplay = "inside",
  isMentored = chip?.isMentored === true,
}: {
  chip: JobChip | null;
  compact?: boolean;
  eyebrowDisplay?: "inside" | "outside";
  isMentored?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (!chip) {
    return isMentored ? <MentoredPill /> : null;
  }

  const accessibilityLabel = chip.eyebrowLabel
    ? `${chip.eyebrowLabel} ${chip.label}${isMentored ? " mentored assignment" : ""}`
    : `Job ${chip.label}${isMentored ? " mentored assignment" : ""}`;
  const showsLabeledValue = chip.eyebrowLabel != null;
  const shouldRenderEyebrowInsidePill = eyebrowDisplay === "inside" && chip.eyebrowLabel;
  const shouldRenderSingleLinePill = !showsLabeledValue || eyebrowDisplay === "outside";

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.jobPill,
        compact && styles.jobPillCompact,
        { backgroundColor: chip.backgroundColor },
      ]}
    >
      {shouldRenderSingleLinePill ? (
        <View style={styles.jobPillInlineTextRow}>
          <Text
            fit="compact"
            style={[
              styles.jobPillText,
              compact && styles.jobPillTextCompact,
              { color: chip.textColor },
            ]}
          >
            {chip.label}
          </Text>
          {isMentored ? (
            <Text
              fit="compact"
              style={[
                styles.jobPillMentoredInlineText,
                compact && styles.jobPillMentoredInlineTextCompact,
                { color: chip.textColor },
              ]}
            >
              (Mentored)
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.jobPillTextStack}>
          {shouldRenderEyebrowInsidePill ? (
            <Text
              fit="compact"
              style={[
                styles.jobPillEyebrowText,
                compact && styles.jobPillEyebrowTextCompact,
                { color: chip.textColor },
              ]}
            >
              {chip.eyebrowLabel}
            </Text>
          ) : null}
          <Text
            fit="compact"
            style={[
              styles.jobPillValueText,
              compact && styles.jobPillValueTextCompact,
              { color: chip.textColor },
            ]}
          >
            {chip.label}
            {isMentored ? (
              <Text style={[styles.jobPillMentoredText, { color: chip.textColor }]}>
                {" "}
                (Mentored)
              </Text>
            ) : null}
          </Text>
        </View>
      )}
    </View>
  );
}

function MeTypePill({
  chip,
  compact,
  inverseLabel,
  titleScale = "row",
  isMentored = chip?.isMentored === true,
}: {
  chip: JobChip | null;
  compact?: boolean;
  inverseLabel?: boolean;
  titleScale?: "hero" | "row";
  isMentored?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (!chip) {
    return isMentored ? <MentoredPill /> : null;
  }

  if (!chip.eyebrowLabel) {
    return <JobPill chip={chip} compact={compact} isMentored={isMentored} />;
  }

  return (
    <View style={styles.meTypePillStack}>
      <Text
        fit="compact"
        style={[
          styles.meTypePillLabel,
          titleScale === "hero" ? styles.meTypePillLabelHero : styles.meTypePillLabelRow,
          inverseLabel && styles.meTypePillLabelInverse,
        ]}
      >
        {chip.eyebrowLabel}
      </Text>
      <JobPill chip={chip} compact={compact} eyebrowDisplay="outside" isMentored={isMentored} />
    </View>
  );
}

type PreviousShiftSummary = { prefix: "Was" | "Removed"; text: string };

function getPreviousShiftSummary(
  change: MobileScheduleSegmentChange | null | undefined,
): PreviousShiftSummary | null {
  // A first publication has no earlier published state. Keep the underlying
  // change type for reconciliation, but never imply history in the UI.
  if (change?.kind === "new") {
    return null;
  }
  const previous = change?.previousPresentation;
  if (!previous) {
    return null;
  }

  if (change.kind === "deleted" && previous.segments.length > 1) {
    return { prefix: "Was", text: previous.segments.map(summariseScheduleSegment).join("; ") };
  }

  // A `modified` cell read for one segment names the published segment that
  // segment continues; a survivor with no counterpart of its own names what
  // its removed sibling was instead.
  if (change.previousSegment) {
    return { prefix: "Was", text: summariseScheduleSegment(change.previousSegment) };
  }
  if (change.removedSegments?.length) {
    return {
      prefix: "Removed",
      text: change.removedSegments.map(summariseScheduleSegment).join("; "),
    };
  }

  const title = previous.shiftName?.trim() || previous.label?.trim() || null;
  const timeRange = formatScheduleTimeRange(previous.startTime, previous.endTime);
  const focusAreaName = previous.displayFocusAreaName?.trim() || null;
  const parts = [title, timeRange, focusAreaName].filter((part): part is string =>
    Boolean(part && part.trim()),
  );

  return parts.length > 0 ? { prefix: "Was", text: parts.join(" · ") } : null;
}

/**
 * The day's "What changed" button, the one shift detail shows, when
 * the server sent the whole day's change (item 46d), once per day;
 * otherwise the older one-line summary.
 */
function PreviousChange({
  entry,
  change,
  firstOfDay,
}: {
  entry: MobileScheduleEntry;
  change: MobileScheduleSegmentChange | null | undefined;
  firstOfDay: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const shiftChange = entry.change?.shiftChange ?? null;
  if (shiftChange && shiftChange.kind !== "none") {
    return firstOfDay ? (
      <View style={styles.upcomingWhatChanged}>
        <ShiftChangeButton change={shiftChange} />
      </View>
    ) : null;
  }
  return <PreviousShiftRow change={change} />;
}

export function PreviousShiftRow({
  change,
  inverse = false,
}: {
  change: MobileScheduleSegmentChange | null | undefined;
  inverse?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const summary = getPreviousShiftSummary(change);

  if (!summary) {
    return null;
  }

  return (
    <View accessibilityLabel={`Previous shift: ${summary.text}`} style={styles.previousShiftRow}>
      <Ionicons
        color={inverse ? mobileOnAccent.tertiary : mobileColors.textSubtle}
        name="arrow-undo-outline"
        size={14}
      />
      <Text style={[styles.previousShiftText, inverse && styles.previousShiftTextInverse]}>
        {summary.prefix} {summary.text}
      </Text>
    </View>
  );
}

function MeHeroShiftmates({ entries }: { entries: MobileScheduleEntry[] }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (entries.length === 0) {
    return null;
  }

  const visibleEntries = entries.slice(0, 3);
  const overflowCount = entries.length - visibleEntries.length;
  const collaboratorBackground = {
    backgroundColor: isDark
      ? HERO_COLLABORATOR_BACKGROUND_DARK
      : HERO_COLLABORATOR_BACKGROUND_LIGHT,
  };

  return (
    <View style={[styles.meHeroCollaborators, collaboratorBackground]}>
      <View style={styles.meHeroCollaboratorLabelRow}>
        <Ionicons color={mobileOnAccent.tertiary} name="people-outline" size={22} />
        <Text style={styles.meHeroCollaboratorLabel}>Working with</Text>
      </View>
      <View style={styles.meHeroAvatarStack}>
        {visibleEntries.map((entry, index) => {
          const avatarTone = getAvatarTone(entry.employeeId, isDark);

          return (
            <View
              key={`${entry.employeeId}-${entry.date}`}
              style={[
                styles.meHeroCollaboratorAvatarFrame,
                collaboratorBackground,
                index > 0 && styles.meHeroCollaboratorAvatarFrameOverlap,
              ]}
            >
              <View
                style={[
                  styles.meHeroCollaboratorAvatar,
                  {
                    backgroundColor: avatarTone.backgroundColor,
                    borderColor: avatarTone.borderColor,
                  },
                ]}
              >
                <Text
                  fit="fixed"
                  style={[styles.meHeroCollaboratorAvatarText, { color: avatarTone.textColor }]}
                >
                  {getInitials(entry.employeeName)}
                </Text>
              </View>
            </View>
          );
        })}
        {overflowCount > 0 ? (
          <View
            style={[
              styles.meHeroCollaboratorAvatarFrame,
              collaboratorBackground,
              visibleEntries.length > 0 && styles.meHeroCollaboratorAvatarFrameOverlap,
            ]}
          >
            <View style={styles.meHeroCollaboratorOverflow}>
              <Text fit="fixed" style={styles.meHeroCollaboratorOverflowText}>
                +{overflowCount}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Where a half sits among its entry's segments, by identity or by content. */
function findSegmentIndex(
  segments: readonly MobileScheduleEntrySegment[],
  segment: MobileScheduleEntrySegment,
): number {
  const same = segments.indexOf(segment);
  if (same >= 0) return same;
  return segments.findIndex(
    (candidate) =>
      candidate.shiftId === segment.shiftId &&
      candidate.jobId === segment.jobId &&
      candidate.startTime === segment.startTime &&
      candidate.focusAreaId === segment.focusAreaId,
  );
}

/**
 * A shift's notes on a row showing one half: each note on one half, as in
 * shift detail. A removed shift shows none.
 */
export function getSegmentScheduleNotes(
  entry: MobileScheduleEntry,
  segment: MobileScheduleEntrySegment | null | undefined,
) {
  if (isDeletedScheduleHistory(entry)) return [];
  const segments = getScheduleEntrySegments(entry);
  const index = segment ? findSegmentIndex(segments, segment) : -1;
  return scheduleNotesForSegment(entry.indicators, segments, Math.max(index, 0));
}

// Every context row on the hero (focus area, time, notes) leads with one
// icon, all one size so the rows' text starts in one column.
const HERO_ROW_ICON_SIZE = 20;

// The first-run tour renders this card with sample data
// (`onboarding/components/previews`), so it is exported.
export function MeHeroCard({
  currentDate,
  currentTime,
  featuredItem,
  status,
  timing,
  shiftmates,
  hasWeekItems = false,
  onPress,
}: {
  currentDate: string;
  currentTime: string;
  featuredItem: FeaturedMeScheduleSegment["item"];
  status: FeaturedMeScheduleSegment["status"];
  timing: HeroTiming | null;
  shiftmates: MobileScheduleEntry[];
  /** Whether Your Week below has any scheduled day; the empty copy differs. */
  hasWeekItems?: boolean;
  onPress?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (!featuredItem) {
    // Late in a week that had shifts, "nothing scheduled this week" sat over
    // a list of them; what is true is that nothing more is coming.
    return (
      <View style={styles.meSectionBlock} testID="me-empty-schedule-state">
        <EmptyStateCard
          iconName="calendar-outline"
          title={hasWeekItems ? "Nothing more this week" : "Nothing scheduled this week"}
          body={
            hasWeekItems
              ? "You've finished your shifts for this week."
              : "Your upcoming shifts will appear here once published."
          }
        />
      </View>
    );
  }
  // The hero stands for the whole day, halves included, so it lists every note.
  const heroNotes = isDeletedScheduleHistory(featuredItem.entry)
    ? []
    : scheduleNotesForRow(featuredItem.entry.indicators);

  const badgeLabel =
    status === "active"
      ? "On duty"
      : status === "away"
        ? "Away"
        : status === "upcoming"
          ? "Upcoming"
          : "Scheduled";
  const heroDateLabel = formatCompactScheduleDate(featuredItem.date);
  const heroDateParts = getCompactScheduleDateParts(featuredItem.date);
  const shiftName = getScheduleItemShiftName(featuredItem);
  const change = getScheduleEntrySegmentChange(featuredItem.entry, featuredItem.segment);
  const visibleTypeChip = getVisibleScheduleItemTypeChip(mobileColors, isDark, featuredItem);
  // An absence is one fact: the "Away" badge already says the kind, so the
  // card leads with the absence's own name and skips the "Absence" eyebrow
  // and pill that restated it as three lines.
  const isAbsenceHero = visibleTypeChip?.kind === "absence";
  const typeChip = isAbsenceHero ? null : visibleTypeChip;
  // A featured shift's absence for the rest of the day sits beside its pill.
  const heroRestOfDayChip = isAbsenceHero
    ? null
    : buildRestOfDayAbsenceChip(mobileColors, isDark, featuredItem.entry);
  const heroTitle = isAbsenceHero ? visibleTypeChip.label : shiftName;
  const shouldShowShiftName = isAbsenceHero || shouldShowMePrimaryTitle(shiftName, typeChip);
  const timeRange = getScheduleItemTimeRange(featuredItem);
  const splitSegments = featuredItem ? getSplitShiftSegmentsForEntry(featuredItem.entry) : [];
  const splitShiftCount = splitSegments.length;
  const focusAreaName = getScheduleItemFocusArea(featuredItem);
  const heroSplitSegments = getMeHeroSupplementalSplitSegments(
    featuredItem,
    splitSegments,
    currentDate,
    currentTime,
  );
  const heroSplitShiftLabel = getScheduleItemSplitShiftLabel(featuredItem);
  const shouldShowHeroSplitBadge = splitShiftCount > 1 && heroSplitSegments.segments.length > 0;
  const heroSplitChangeLabel = splitShiftCount > 1 ? getShiftChangeLabel(change) : null;
  const heroChange = splitShiftCount > 1 ? null : change;
  const heroChangeLabel = getShiftChangeLabel(heroChange);
  const badgeDotStyle =
    status === "active"
      ? styles.meHeroBadgeDotActive
      : status === "away" || status === "empty"
        ? styles.meHeroBadgeDotMuted
        : styles.meHeroBadgeDotScheduled;

  const cardContent = (
    <View style={styles.meHeroContent}>
      {badgeLabel || heroDateParts || shouldShowShiftName || shouldShowHeroSplitBadge ? (
        <View style={styles.meHeroHeader}>
          <View style={styles.meHeroHeaderCopy}>
            {badgeLabel ? (
              <View style={styles.meHeroBadgeRow}>
                <View style={styles.meHeroBadge}>
                  <View style={[styles.meHeroBadgeDot, badgeDotStyle]} />
                  <Text fit="compact" style={styles.meHeroBadgeText}>
                    {badgeLabel}
                  </Text>
                </View>
              </View>
            ) : null}
            {shouldShowShiftName || shouldShowHeroSplitBadge || heroChangeLabel ? (
              <View style={styles.meHeroTitleRow}>
                {shouldShowShiftName ? <Text style={styles.meHeroTitle}>{heroTitle}</Text> : null}
                {heroChangeLabel ? (
                  <View style={styles.meHeroTitleBadgeSlot}>
                    <ShiftChangeBadge change={heroChange} inverse />
                  </View>
                ) : null}
                {shouldShowHeroSplitBadge ? (
                  <View style={styles.meHeroTitleBadgeSlot}>
                    <SplitShiftBadge
                      count={splitShiftCount}
                      inverse
                      label={
                        heroSplitChangeLabel
                          ? `${heroSplitShiftLabel ?? "Shift"} · ${heroSplitChangeLabel}`
                          : heroSplitShiftLabel
                      }
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
            {typeChip || heroRestOfDayChip ? (
              <View style={styles.meHeroRoleRow}>
                <MeTypePill
                  chip={typeChip}
                  compact
                  inverseLabel
                  isMentored={featuredItem.segment.isMentored === true}
                  titleScale="hero"
                />
                {heroRestOfDayChip ? (
                  <MeTypePill chip={heroRestOfDayChip} compact inverseLabel titleScale="hero" />
                ) : null}
              </View>
            ) : featuredItem.segment.isMentored ? (
              <MentoredPill />
            ) : null}
          </View>
          {heroDateParts ? (
            <View accessibilityLabel={heroDateLabel ?? undefined} style={styles.meHeroDateTile}>
              <Text fit="fixed" style={styles.meHeroDateWeekday}>
                {heroDateParts.weekdayLabel}
              </Text>
              <Text fit="fixed" style={styles.meHeroDateDay}>
                {heroDateParts.dayLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {focusAreaName || timeRange || timing?.progress != null ? (
        <View style={styles.meHeroContextGroup}>
          {focusAreaName ? (
            <View style={styles.meHeroAreaRow}>
              <Ionicons
                color={mobileOnAccent.secondary}
                name="location-outline"
                size={HERO_ROW_ICON_SIZE}
              />
              <Text fit="compact" style={styles.meHeroAreaLabel}>
                {focusAreaName}
              </Text>
            </View>
          ) : null}
          {timeRange ? (
            <View style={styles.meHeroScheduleRow}>
              <View style={styles.meHeroTimeRow}>
                <Ionicons
                  color={mobileOnAccent.secondary}
                  name="time-outline"
                  size={HERO_ROW_ICON_SIZE}
                />
                <Text style={styles.meHeroTimeText}>{timeRange}</Text>
              </View>
              {timing ? <Text style={styles.meHeroProgressLabel}>{timing.label}</Text> : null}
            </View>
          ) : null}
          {timing?.progress != null ? (
            <View style={styles.meHeroProgressTrack}>
              <AnimatedMeterFill
                percent={Math.max(timing.progress, 0.08) * 100}
                style={styles.meHeroProgressFill}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {heroNotes.length > 0 ? (
        <View style={styles.meHeroNotesRow}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={mobileOnAccent.secondary}
            importantForAccessibility="no-hide-descendants"
            name="note-outline"
            size={HERO_ROW_ICON_SIZE}
            style={styles.meHeroNotesIcon}
          />
          <ScheduleNoteLabels
            inverse
            notes={heroNotes}
            showIcon={false}
            style={styles.meHeroNotesList}
            textVariant="rowTitle"
          />
        </View>
      ) : null}
      <MeHeroShiftmates entries={shiftmates} />
      {heroSplitSegments.segments.length > 0 ? (
        <SplitShiftSegmentList
          dashedDividers
          inverse
          leadingDivider
          renderSegmentChip={(segment) => (
            <JobPill
              chip={getSegmentJobChip(mobileColors, isDark, segment)}
              compact
              eyebrowDisplay="outside"
              isMentored={segment.isMentored === true}
            />
          )}
          getSegmentTimingLabel={(segment) =>
            getHeroTiming(
              featuredItem.entry,
              getSegmentStartTime(segment),
              getSegmentEndTime(segment),
              "scheduled",
              currentDate,
              currentTime,
            )?.label ?? null
          }
          getSegmentStatusLabel={(segment) =>
            getShiftChangeLabel(getScheduleEntrySegmentChange(featuredItem.entry, segment))
          }
          segmentLabelIndices={heroSplitSegments.segmentLabelIndices}
          segmentLabelTotalCount={splitShiftCount}
          segments={heroSplitSegments.segments}
          showWhenSingle
          suppressCountAccessibilityLabel
          variant="hero"
        />
      ) : null}
    </View>
  );

  const heroGradient = (
    <LinearGradient
      colors={isDark ? HERO_CARD_GRADIENT_DARK : HERO_CARD_GRADIENT_LIGHT}
      locations={HERO_CARD_GRADIENT_LOCATIONS}
      start={HERO_CARD_GRADIENT_START}
      end={HERO_CARD_GRADIENT_END}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    />
  );
  const heroCardThemeStyle = {
    backgroundColor: isDark ? HERO_CARD_BACKGROUND_DARK : HERO_CARD_BACKGROUND_LIGHT,
    shadowColor: isDark ? HERO_CARD_SHADOW_DARK : HERO_CARD_SHADOW_LIGHT,
  };

  return (
    <View style={styles.meSectionBlock}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.meHeroCard,
            heroCardThemeStyle,
            pressed && styles.meHeroCardPressed,
          ]}
          testID="me-hero-card"
        >
          <View style={styles.meHeroCardClip}>
            {heroGradient}
            {cardContent}
          </View>
        </Pressable>
      ) : (
        <View style={[styles.meHeroCard, heroCardThemeStyle]} testID="me-hero-card">
          <View style={styles.meHeroCardClip}>
            {heroGradient}
            {cardContent}
          </View>
        </View>
      )}
    </View>
  );
}

export function UpcomingShiftsSection({
  items,
  onPressEntry,
  summary,
  todayDate,
  weekDays,
}: {
  items: Array<NonNullable<FeaturedMeScheduleSegment["item"]>>;
  onPressEntry: (entry: MobileScheduleEntry) => void;
  summary: WeeklyHoursSummary | null;
  todayDate: string;
  weekDays: MobileScheduleWeekDay[];
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (weekDays.length === 0) {
    return null;
  }

  const hoursLabel =
    summary && summary.scheduledHours > 0
      ? `${formatHoursValue(summary.scheduledHours)}h this week`
      : null;
  const itemsByDate = new Map<string, Array<NonNullable<FeaturedMeScheduleSegment["item"]>>>();
  const deletedEntriesByDate = new Map<string, MobileScheduleEntry[]>();
  items.forEach((item) => {
    const isDeleted = getScheduleEntrySegmentChange(item.entry, item.segment)?.kind === "deleted";
    if (isDeleted) {
      const deletedEntries = deletedEntriesByDate.get(item.date) ?? [];
      if (!deletedEntries.includes(item.entry)) {
        deletedEntries.push(item.entry);
        deletedEntriesByDate.set(item.date, deletedEntries);
      }
      return;
    }

    const dateItems = itemsByDate.get(item.date) ?? [];
    dateItems.push(item);
    itemsByDate.set(item.date, dateItems);
  });
  const groupedItems = weekDays.map((day) => ({
    date: day.date,
    items: itemsByDate.get(day.date) ?? [],
    deletedEntries: deletedEntriesByDate.get(day.date) ?? [],
  }));

  return (
    <View style={styles.upcomingSectionBlock}>
      <View style={styles.upcomingSectionHeader}>
        <Text style={styles.upcomingSectionTitle}>Your week</Text>
        {hoursLabel ? (
          <Text fit="compact" style={styles.upcomingHoursText}>
            {hoursLabel}
          </Text>
        ) : null}
      </View>

      <View style={styles.upcomingShiftsCard}>
        {groupedItems.map((group, groupIndex) => {
          const isToday = group.date === todayDate;
          return (
            <View
              key={group.date}
              style={[
                styles.upcomingDateGroup,
                isToday && styles.upcomingShiftRowToday,
                isToday && groupIndex === 0 && styles.upcomingShiftRowTodayFirst,
                isToday &&
                  groupIndex === groupedItems.length - 1 &&
                  styles.upcomingShiftRowTodayLast,
              ]}
              testID={isToday ? `upcoming-today-row-${group.date}` : undefined}
            >
              {groupIndex > 0 ? <View style={styles.upcomingDaySeparator} /> : null}
              <View style={styles.upcomingDateColumn}>
                <ScheduleDateTile
                  date={group.date}
                  isToday={isToday}
                  todayTestID={`upcoming-today-date-${group.date}`}
                />
              </View>

              <View style={styles.upcomingDateShiftStack}>
                {group.items.length === 0 ? (
                  <View
                    accessibilityLabel={`Unscheduled ${formatCompactScheduleDate(group.date)}`}
                    style={styles.upcomingUnscheduledRow}
                    testID={`upcoming-unscheduled-row-${group.date}`}
                  >
                    <Text
                      maxFontSizeMultiplier={MAX_FONT_SCALE}
                      style={styles.upcomingUnscheduledTitle}
                    >
                      Unscheduled
                    </Text>
                    {group.deletedEntries.map((entry) => (
                      <PreviousChange
                        key={`${entry.employeeId}:${entry.date}`}
                        entry={entry}
                        change={entry.change}
                        firstOfDay
                      />
                    ))}
                  </View>
                ) : (
                  <>
                    {[...new Set(group.items.map((item) => item.entry))].map((entry) => {
                      const restOfDayChip = restOfDayAbsenceComesFirst(entry)
                        ? buildRestOfDayAbsenceChip(mobileColors, isDark, entry)
                        : null;
                      return restOfDayChip ? (
                        <Fragment key={`${entry.employeeId}:${entry.date}:arrived-late`}>
                          <PressableRow
                            onPress={() => onPressEntry(entry)}
                            style={styles.upcomingShiftRow}
                          >
                            <View
                              style={styles.upcomingShiftCopy}
                              testID={`upcoming-rest-of-day-row-${group.date}`}
                            >
                              <MeTypePill chip={restOfDayChip} compact />
                              <Text
                                maxFontSizeMultiplier={MAX_FONT_SCALE}
                                style={styles.upcomingShiftArea}
                              >
                                {restOfDayAbsenceTimeLabel(entry)}
                              </Text>
                            </View>
                          </PressableRow>
                          <UpcomingShiftDivider />
                        </Fragment>
                      ) : null;
                    })}
                    {group.items.map((item, itemIndex) => {
                      const typeChip = getScheduleItemTypeChip(mobileColors, isDark, item);
                      const change = getScheduleEntrySegmentChange(item.entry, item.segment);
                      const shiftName = getScheduleItemShiftName(item);
                      const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, typeChip);
                      const focusAreaName = getScheduleItemFocusArea(item);
                      const timeRange = getScheduleItemTimeRange(item);
                      const splitSegments = getSplitShiftSegmentsForEntry(item.entry);
                      const splitShiftLabel = getScheduleItemSplitShiftLabel(item);
                      const splitChangeLabel =
                        splitSegments.length > 1 ? getShiftChangeLabel(change) : null;

                      return (
                        <Fragment key={item.key}>
                          {itemIndex > 0 ? <UpcomingShiftDivider /> : null}
                          <PressableRow
                            onPress={() => onPressEntry(item.entry)}
                            style={styles.upcomingShiftRow}
                          >
                            <View style={styles.upcomingShiftCopy}>
                              {/* Title and time stack rather than sitting in two
                              columns. Side by side, the time never gave width
                              back, so at a raised OS text size the name was
                              squeezed into a column narrow enough to break
                              mid-word ("Visitin / g Nursin / g"). */}
                              {shouldShowShiftName || splitSegments.length > 1 || timeRange ? (
                                <View style={styles.upcomingShiftHeading}>
                                  {shouldShowShiftName || splitSegments.length > 1 || change ? (
                                    <View style={styles.upcomingShiftTitleMeta}>
                                      {shouldShowShiftName ? (
                                        <Text
                                          maxFontSizeMultiplier={MAX_FONT_SCALE}
                                          style={styles.upcomingShiftTitle}
                                        >
                                          {shiftName}
                                        </Text>
                                      ) : null}
                                      {splitSegments.length > 1 ? (
                                        <SplitShiftBadge
                                          count={splitSegments.length}
                                          label={
                                            splitChangeLabel
                                              ? `${splitShiftLabel ?? "Shift"} · ${splitChangeLabel}`
                                              : splitShiftLabel
                                          }
                                        />
                                      ) : null}
                                      <ShiftChangeBadge
                                        change={splitSegments.length > 1 ? null : change}
                                      />
                                    </View>
                                  ) : null}
                                </View>
                              ) : null}
                              <MeTypePill
                                chip={typeChip}
                                compact
                                isMentored={item.segment.isMentored === true}
                              />
                              {focusAreaName ? (
                                <Text
                                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                                  style={styles.upcomingShiftArea}
                                >
                                  {focusAreaName}
                                </Text>
                              ) : null}
                              {timeRange ? (
                                <View style={styles.upcomingShiftTime}>
                                  <Text
                                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                                    style={styles.upcomingShiftTimeText}
                                  >
                                    {timeRange}
                                  </Text>
                                </View>
                              ) : null}
                              <ScheduleNoteLabels
                                notes={getSegmentScheduleNotes(item.entry, item.segment)}
                              />
                              <PreviousChange
                                entry={item.entry}
                                change={change}
                                firstOfDay={
                                  group.items.findIndex(
                                    (candidate) => candidate.entry === item.entry,
                                  ) === itemIndex
                                }
                              />
                            </View>
                          </PressableRow>
                        </Fragment>
                      );
                    })}
                    {[...new Set(group.items.map((item) => item.entry))].map((entry) => {
                      // A worked cell's absence beside its shifts (items 45
                      // and 50) is its own row after them, or before them
                      // when they arrived late, with the time it covers.
                      const restOfDayChip = buildRestOfDayAbsenceChip(mobileColors, isDark, entry);
                      return restOfDayChip && !restOfDayAbsenceComesFirst(entry) ? (
                        <Fragment key={`${entry.employeeId}:${entry.date}:rest-of-day`}>
                          <UpcomingShiftDivider />
                          <PressableRow
                            onPress={() => onPressEntry(entry)}
                            style={styles.upcomingShiftRow}
                          >
                            <View
                              style={styles.upcomingShiftCopy}
                              testID={`upcoming-rest-of-day-row-${group.date}`}
                            >
                              <MeTypePill chip={restOfDayChip} compact />
                              <Text
                                maxFontSizeMultiplier={MAX_FONT_SCALE}
                                style={styles.upcomingShiftArea}
                              >
                                {restOfDayAbsenceTimeLabel(entry) ?? "Part of the day"}
                              </Text>
                            </View>
                          </PressableRow>
                        </Fragment>
                      ) : null;
                    })}
                    {group.deletedEntries.map((entry) => (
                      <Fragment key={`${entry.employeeId}:${entry.date}`}>
                        <UpcomingShiftDivider />
                        <View style={styles.upcomingDeletedHistoryRow}>
                          <PreviousChange entry={entry} change={entry.change} firstOfDay />
                        </View>
                      </Fragment>
                    ))}
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function UpcomingShiftDivider() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View
      pointerEvents="none"
      style={styles.upcomingShiftDivider}
      testID="upcoming-shift-divider"
    />
  );
}

export function OpenShiftsSection({
  requests,
  openShifts,
  scheduleEntries,
  linkedEmployeeId,
  pendingAction,
  now,
  requestsError,
  timeZone,
  openShiftVisibility,
  onClaim,
  onVolunteer,
  onSeeAll,
  showEveryGap = false,
}: {
  requests: MobileShiftRequest[];
  openShifts: MobileOpenShift[];
  scheduleEntries: MobileScheduleEntry[];
  linkedEmployeeId: string | null;
  pendingAction: PendingRequestAction;
  now: Date;
  requestsError: unknown;
  timeZone?: string | null;
  openShiftVisibility?: {
    coverageGap: "hidden" | "matched" | "always";
    calloff: "hidden" | "matched" | "always";
  };
  onClaim: (requestId: string) => void;
  onVolunteer: (openShift: MobileOpenShift) => void;
  onSeeAll: () => void;
  /**
   * A manager's view: every gap in their scope, with Claim only where they can
   * work it. A card they can't take shows the shift alone, with no reason why.
   */
  showEveryGap?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const { pushToast } = useToast();
  // The day whose full list is open in the sheet; the carousel itself never
  // grows, a day with more than one shift shows its first and opens the rest.
  const [openDate, setOpenDate] = useState<string | null>(null);
  const handoff = useModalHandoff();
  useEffect(() => {
    if (requestsError) {
      pushClientFriendlyErrorToast(pushToast, {
        error: requestsError,
        title: "Couldn't load shift requests",
        fallbackMessage: "We couldn't load shift requests right now.",
        // This section and the cover-requests section below render together in
        // personal scope and read the same query, so one failure used to raise
        // two differently-titled toasts. One failure, one toast.
        dedupeKey: SCHEDULE_REQUESTS_ERROR_TOAST_KEY,
      });
    }
  }, [requestsError, pushToast]);
  const availableOpenShiftFeed = useMemo(
    () =>
      buildAvailableOpenShiftFeed({
        linkedEmployeeId,
        scheduleEntries,
        openShifts,
        requests,
        now,
        timeZone,
        showAll: showEveryGap,
        coverageGapVisibility: openShiftVisibility?.coverageGap,
        calloffVisibility: openShiftVisibility?.calloff,
      }),
    [
      linkedEmployeeId,
      now,
      openShifts,
      requests,
      scheduleEntries,
      timeZone,
      openShiftVisibility,
      showEveryGap,
    ],
  );
  const dateGroups = availableOpenShiftFeed.groups;
  const openGroup =
    openDate != null ? (dateGroups.find((group) => group.date === openDate) ?? null) : null;
  const renderFeedCard = (
    item: AvailableShiftFeedItem,
    options?: {
      accessibilityLabel?: string;
      onToggle?: () => void;
      /**
       * Wraps Volunteer and Claim inside the day sheet: the sheet closes first
       * and the action runs once it has left. Its confirmation is a Modal of
       * its own, which UIKit refuses to present while the sheet is still
       * dismissing, and the toast that reports the result would be hidden
       * behind an open sheet anyway.
       */
      runAction?: (action: () => void) => void;
    },
  ) => {
    const runAction = options?.runAction ?? ((action: () => void) => action());
    const cardStyle = styles.openShiftCard;
    const cardWithActionsStyle = [
      styles.openShiftCard,
      IS_NATIVE_LIST && styles.cardWithActionRows,
    ];
    const cardSurfaceProps =
      options?.onToggle != null
        ? {
            accessibilityLabel: options.accessibilityLabel,
            onPress: options.onToggle,
          }
        : null;

    if (item.kind === "open_shift") {
      const volunteerBody: RequestActionBody | null = linkedEmployeeId
        ? {
            action: "volunteer_open_shift",
            empId: linkedEmployeeId,
            shiftDate: item.openShift.date,
            focusAreaId: item.openShift.focusAreaId,
            state: item.openShift.state,
          }
        : null;
      const isVolunteerLoading =
        volunteerBody != null &&
        pendingAction?.key === getMobileRequestActionKey(item.openShift.id, volunteerBody);
      const jobChip = getOpenShiftJobChip(mobileColors, isDark, item.openShift);
      const isMentored = hasMentoredSegments(item.openShift.presentation.segments);
      const shiftName = getOpenShiftShiftName(item.openShift);
      const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, jobChip);
      const focusAreaName = getOpenShiftFocusAreaName(item.openShift);
      const timeRange = getOpenShiftTimeRange(item.openShift);
      const splitSegments = getSplitShiftSegmentsFromPresentation(
        item.openShift.presentation,
        item.openShift.state,
      );
      const hasSplitSegments = splitSegments.length > 1;
      const content = (
        <>
          {shouldShowShiftName || hasSplitSegments ? (
            <View style={styles.scheduleRowTitleWithBadge}>
              {shouldShowShiftName ? (
                <Text style={styles.scheduleRowTitle}>{shiftName}</Text>
              ) : null}
              {hasSplitSegments ? <SplitShiftBadge count={splitSegments.length} /> : null}
            </View>
          ) : null}
          {hasSplitSegments ? (
            <View style={styles.openShiftSplitPanel}>
              <SplitShiftSegmentList
                renderSegmentChip={(segment) => (
                  <JobPill
                    chip={getSegmentJobChip(mobileColors, isDark, segment)}
                    compact
                    eyebrowDisplay="outside"
                    isMentored={segment.isMentored === true}
                  />
                )}
                segments={splitSegments}
                variant="compact"
              />
            </View>
          ) : jobChip || focusAreaName || isMentored ? (
            <View style={styles.scheduleRowContextStack}>
              {focusAreaName ? <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text> : null}
              {jobChip || isMentored ? (
                <View style={styles.scheduleRowContext}>
                  <MeTypePill chip={jobChip} compact isMentored={isMentored} />
                </View>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.scheduleRowMeta}>
            {item.openShift.needed} teammate
            {item.openShift.needed === 1 ? "" : "s"} needed
          </Text>
          {!hasSplitSegments && timeRange ? (
            <View style={styles.scheduleRowTime}>
              <Ionicons color={mobileColors.textMuted} name="time-outline" size={18} />
              <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
            </View>
          ) : null}
        </>
      );
      const cardSurface = cardSurfaceProps ? (
        <PressableRow
          accessibilityLabel={cardSurfaceProps.accessibilityLabel}
          onPress={cardSurfaceProps.onPress}
          style={styles.openShiftCardSurface}
        >
          {content}
        </PressableRow>
      ) : (
        <View style={styles.openShiftCardSurface}>{content}</View>
      );
      const volunteerBlockReason =
        item.openShift.canVolunteer === false
          ? (item.openShift.volunteerBlockReason ?? "You can't volunteer for this shift right now.")
          : null;

      if (showEveryGap && item.openShift.canVolunteer === false) {
        return (
          <View key={item.key} style={cardStyle}>
            {cardSurface}
          </View>
        );
      }

      return (
        <View key={item.key} style={cardWithActionsStyle}>
          {cardSurface}
          {volunteerBlockReason ? (
            <Text style={styles.scheduleRowMeta}>{volunteerBlockReason}</Text>
          ) : null}
          <CardActionRows
            actions={[
              {
                key: "claim",
                label: "Claim",
                disabled:
                  Boolean(pendingAction) ||
                  !linkedEmployeeId ||
                  item.openShift.canVolunteer === false,
                loading: isVolunteerLoading,
                onPress: () => {
                  if (item.openShift.canVolunteer === false) {
                    return;
                  }
                  runAction(() => onVolunteer(item.openShift));
                },
              },
            ]}
            style={styles.cardActionRowsFoot}
          />
        </View>
      );
    }

    const claimBody: RequestActionBody | null = linkedEmployeeId
      ? {
          action: "claim",
          claimerEmpId: linkedEmployeeId,
        }
      : null;
    const isPendingVolunteerRequest =
      item.request.type === "pickup" &&
      item.request.status === "pending_approval" &&
      item.request.requesterEmpId === linkedEmployeeId &&
      item.request.targetEmpId == null &&
      item.request.parentRequestId == null;
    const isClaimLoading =
      claimBody != null &&
      pendingAction?.key === getMobileRequestActionKey(item.request.id, claimBody);
    const jobChip = getRequestJobChip(mobileColors, isDark, item.request, "requester");
    const isMentored = hasMentoredSegments(getRequestSegments(item.request, "requester"));
    const shiftName = getRequestShiftName(item.request, "requester");
    const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, jobChip);
    const focusAreaName = getRequestFocusAreaName(item.request, "requester");
    const timeRange = getRequestTimeRange(item.request, "requester");
    const cardSurface = cardSurfaceProps ? (
      <PressableRow
        accessibilityLabel={cardSurfaceProps.accessibilityLabel}
        onPress={cardSurfaceProps.onPress}
        style={styles.openShiftCardSurface}
      >
        {shouldShowShiftName ? <Text style={styles.scheduleRowTitle}>{shiftName}</Text> : null}
        {jobChip || focusAreaName || isMentored ? (
          <View style={styles.scheduleRowContextStack}>
            {focusAreaName ? <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text> : null}
            {jobChip || isMentored ? (
              <View style={styles.scheduleRowContext}>
                <MeTypePill chip={jobChip} compact isMentored={isMentored} />
              </View>
            ) : null}
          </View>
        ) : null}
        {timeRange ? (
          <View style={styles.scheduleRowTime}>
            <Ionicons color={mobileColors.textMuted} name="time-outline" size={18} />
            <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
          </View>
        ) : null}
      </PressableRow>
    ) : (
      <View style={styles.openShiftCardSurface}>
        {shouldShowShiftName ? <Text style={styles.scheduleRowTitle}>{shiftName}</Text> : null}
        {jobChip || focusAreaName || isMentored ? (
          <View style={styles.scheduleRowContextStack}>
            {focusAreaName ? <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text> : null}
            {jobChip || isMentored ? (
              <View style={styles.scheduleRowContext}>
                <MeTypePill chip={jobChip} compact isMentored={isMentored} />
              </View>
            ) : null}
          </View>
        ) : null}
        {timeRange ? (
          <View style={styles.scheduleRowTime}>
            <Ionicons color={mobileColors.textMuted} name="time-outline" size={18} />
            <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
          </View>
        ) : null}
      </View>
    );

    return (
      <View key={item.key} style={cardWithActionsStyle}>
        {cardSurface}
        <CardActionRows
          actions={[
            {
              key: "claim",
              label: isPendingVolunteerRequest ? "Pending approval" : "Claim",
              disabled: isPendingVolunteerRequest || Boolean(pendingAction) || !linkedEmployeeId,
              loading: isClaimLoading,
              onPress: () => runAction(() => onClaim(item.request.id)),
              webIcon: isPendingVolunteerRequest ? "hourglass-outline" : undefined,
            },
          ]}
          style={styles.cardActionRowsFoot}
        />
      </View>
    );
  };

  // Home shows a section only when it has something to act on; an empty
  // "No open shifts" card there is noise. The admin dashboard is different
  // and keeps its empty sections, and the Requests tab lists everything.
  if (requestsError || availableOpenShiftFeed.totalCount === 0) {
    return null;
  }

  return (
    <View style={styles.meSectionBlock}>
      <MeSectionHeader actionLabel="See all" onAction={onSeeAll} title="Open shifts" />

      <ScrollView
        accessibilityLabel="Open shifts carousel"
        horizontal
        style={styles.openShiftCarousel}
        contentContainerStyle={styles.openShiftCarouselContent}
        showsHorizontalScrollIndicator={false}
      >
        {dateGroups.map((group) => {
          const dateLabel = formatCompactScheduleDate(group.date);
          const leadItem = group.items[0];
          // A day with more than one shift shows its first, flat like the
          // rest, and opens the whole day in a sheet; the count beside the
          // date says how many there are.
          const opensDay = group.items.length > 1;

          return (
            <View key={group.date} style={styles.openShiftDateCard}>
              <View style={styles.openShiftDateHeader}>
                <Text style={styles.scheduleRowDate}>{dateLabel}</Text>
                <NumericBadge
                  count={group.itemCount}
                  label={formatOpenShiftCardCountLabel(group.itemCount)}
                  tone="secondary"
                />
              </View>
              <View style={styles.openShiftDateCardItems}>
                {leadItem
                  ? renderFeedCard(
                      leadItem,
                      opensDay
                        ? {
                            accessibilityLabel: `Show all open shifts for ${dateLabel}`,
                            onToggle: () => setOpenDate(group.date),
                          }
                        : undefined,
                    )
                  : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <BottomSheetModal
        accessibilityLabel="Dismiss open shifts"
        debugName="Open shifts for a day"
        header={
          openGroup ? (
            <SheetHeader
              subtitle={`${openGroup.itemCount} open shift${openGroup.itemCount === 1 ? "" : "s"}`}
              title={formatCompactScheduleDate(openGroup.date)}
            />
          ) : undefined
        }
        scrollable
        visible={openGroup != null}
        onDismiss={() => setOpenDate(null)}
      >
        <View style={styles.openShiftSheetList}>
          {openGroup?.items.map((item) =>
            renderFeedCard(item, {
              runAction: (action) => {
                setOpenDate(null);
                handoff(action);
              },
            }),
          )}
        </View>
      </BottomSheetModal>
    </View>
  );
}

export function ShiftCoverRequestsSection({
  requests,
  linkedEmployeeId,
  pendingAction,
  requestsError,
  onRespond,
}: {
  requests: MobileShiftRequest[];
  linkedEmployeeId: string | null;
  pendingAction: PendingRequestAction;
  requestsError: unknown;
  onRespond: (requestId: string, accept: boolean) => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const { pushToast } = useToast();
  useEffect(() => {
    if (requestsError) {
      pushClientFriendlyErrorToast(pushToast, {
        error: requestsError,
        title: "Couldn't load shift requests",
        fallbackMessage: "We couldn't load shift requests right now.",
        dedupeKey: SCHEDULE_REQUESTS_ERROR_TOAST_KEY,
      });
    }
  }, [requestsError, pushToast]);

  // Only when something actually needs an answer; see OpenShiftsSection.
  if (requestsError || requests.length === 0) {
    return null;
  }

  return (
    <View style={styles.meSectionBlock}>
      <MeSectionHeader title="Needs your response" />

      <View style={styles.requestList}>
        {requests.map((request) => {
          const avatarTone = getAvatarTone(request.requesterEmpId, isDark);
          const jobChip = getRequestJobChip(mobileColors, isDark, request, "requester");
          const shiftName = getRequestShiftName(request, "requester");
          const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, jobChip);
          const focusAreaName = getRequestFocusAreaName(request, "requester");
          const isMentored = hasMentoredSegments(getRequestSegments(request, "requester"));
          const timeRange = getRequestTimeRange(request, "requester");
          const acceptBody: RequestActionBody | null = linkedEmployeeId
            ? { action: "respond", empId: linkedEmployeeId, accept: true }
            : null;
          const declineBody: RequestActionBody | null = linkedEmployeeId
            ? { action: "respond", empId: linkedEmployeeId, accept: false }
            : null;
          const isAcceptLoading =
            acceptBody != null &&
            pendingAction?.key === getMobileRequestActionKey(request.id, acceptBody);
          const isDeclineLoading =
            declineBody != null &&
            pendingAction?.key === getMobileRequestActionKey(request.id, declineBody);

          return (
            <View
              key={request.id}
              style={[styles.requestCard, IS_NATIVE_LIST && styles.cardWithActionRows]}
            >
              <View style={styles.requestHeaderRow}>
                <View style={styles.requestHeaderCopy}>
                  <View
                    style={[
                      styles.requestAvatar,
                      {
                        backgroundColor: avatarTone.backgroundColor,
                        borderColor: avatarTone.borderColor,
                      },
                    ]}
                  >
                    <Text
                      fit="fixed"
                      style={[styles.requestAvatarText, { color: avatarTone.textColor }]}
                    >
                      {getInitials(request.requesterName)}
                    </Text>
                  </View>
                  <View style={styles.requestHeaderTextStack}>
                    <Text style={styles.requestHeaderText}>{request.requesterName}</Text>
                    <Text style={styles.requestHeaderSubtext}>Asked you to cover a shift</Text>
                  </View>
                </View>
                <Text style={styles.requestDateText}>{getRequestDateLabel(request)}</Text>
              </View>

              {shouldShowShiftName ? (
                <Text style={styles.scheduleRowTitle}>{shiftName}</Text>
              ) : null}
              {jobChip || focusAreaName || isMentored ? (
                <View style={styles.scheduleRowContext}>
                  <MeTypePill chip={jobChip} compact isMentored={isMentored} />
                  {focusAreaName ? (
                    <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text>
                  ) : null}
                </View>
              ) : null}
              {timeRange ? (
                <View style={styles.scheduleRowTime}>
                  <Ionicons color={mobileColors.textMuted} name="time-outline" size={18} />
                  <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
                </View>
              ) : null}

              <CardActionRows
                actions={[
                  {
                    key: "accept",
                    label: "Accept",
                    primary: true,
                    disabled: Boolean(pendingAction) || !linkedEmployeeId,
                    loading: isAcceptLoading,
                    onPress: () => onRespond(request.id, true),
                  },
                  {
                    key: "decline",
                    label: "Decline",
                    webTone: "neutral",
                    disabled: Boolean(pendingAction) || !linkedEmployeeId,
                    loading: isDeclineLoading,
                    onPress: () => onRespond(request.id, false),
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function getInitials(name: string): string {
  const parts = name.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.filter(Boolean) ?? [];

  if (parts.length === 0) {
    return "?";
  }

  const first = parts[0]?.charAt(0).toUpperCase() ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0).toUpperCase() ?? "") : "";

  return `${first}${last}` || "?";
}
