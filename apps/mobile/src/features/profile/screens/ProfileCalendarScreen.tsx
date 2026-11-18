import { useState } from "react";
import type { MobileCalendarSubscriptionIssued } from "@dubgrid/contracts";
import {
  CALENDAR_SUBSCRIBE_LABELS,
  buildCalendarSubscribeLinks,
  type CalendarSubscribeTarget,
} from "@dubgrid/domain";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Linking } from "react-native";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import {
  createCalendarSubscription,
  getCalendarSubscription,
  revokeCalendarSubscription,
  rotateCalendarSubscription,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import {
  ProfileList,
  ProfileListAction,
  ProfileNavRow,
  ProfileSection,
} from "../components/ProfilePrimitives";
import { ProfileSkeleton } from "../components/ProfileSkeleton";
import { CAN_OPEN_APPLE_CALENDAR, shareLink } from "../lib/device-copy";

type CalendarAction = CalendarSubscribeTarget | "share";

type PendingConfirmation = { kind: "replace"; action: CalendarAction } | { kind: "disable" };

const ACTIONS: ReadonlyArray<{
  action: CalendarAction;
  label: string;
  iconName: "logo-apple" | "logo-google" | "logo-microsoft" | "share-outline";
  iosOnly?: boolean;
}> = [
  {
    action: "apple",
    label: CALENDAR_SUBSCRIBE_LABELS.apple,
    iconName: "logo-apple",
    iosOnly: true,
  },
  { action: "google", label: CALENDAR_SUBSCRIBE_LABELS.google, iconName: "logo-google" },
  { action: "outlook", label: CALENDAR_SUBSCRIBE_LABELS.outlook, iconName: "logo-microsoft" },
  { action: "share", label: "Share link", iconName: "share-outline" },
];

async function openCalendarAction(action: CalendarAction, feedUrl: string) {
  if (action === "share") {
    await shareLink(feedUrl);
    return;
  }
  await Linking.openURL(buildCalendarSubscribeLinks(feedUrl)[action]);
}

/**
 * Adds the private ICS feed to a calendar app in one tap.
 *
 * The schema holds one token per person and organization, and its raw URL
 * is disclosed only when issued. So a tap either creates the first link and
 * opens it, or, when a link already exists (created on web, say), confirms
 * that it replaces the old one before rotating. The issued URL is held for
 * the rest of this visit so a second row reuses it instead of rotating again.
 */
export default function ProfileCalendarScreen() {
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [issued, setIssued] = useState<MobileCalendarSubscriptionIssued | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const statusQuery = useQuery({
    queryKey: mobileQueryKeys.calendarSubscription(accessToken),
    queryFn: ({ signal }) => getCalendarSubscription(accessToken!, signal),
    enabled: Boolean(accessToken),
  });

  const issueMutation = useMutation({
    mutationFn: async ({ action, mode }: { action: CalendarAction; mode: "create" | "rotate" }) => {
      const result =
        mode === "create"
          ? await createCalendarSubscription(accessToken!)
          : await rotateCalendarSubscription(accessToken!);
      return { action, result };
    },
    onSuccess: async ({ action, result }) => {
      setIssued(result);
      await statusQuery.refetch();
      await openIssuedLink(action, result.feedUrl);
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Couldn't add calendar",
        fallbackMessage: "We couldn't create your calendar link right now.",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeCalendarSubscription(accessToken!),
    onSuccess: async () => {
      setIssued(null);
      await statusQuery.refetch();
      pushToast({
        tone: "success",
        title: "Subscription disabled",
        message: "Calendar apps stop receiving updates.",
      });
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Couldn't disable subscription",
        fallbackMessage: "We couldn't disable your calendar link right now.",
      });
    },
  });

  // The link already exists by now, so a failed open must not read as a
  // failed create.
  async function openIssuedLink(action: CalendarAction, feedUrl: string) {
    try {
      await openCalendarAction(action, feedUrl);
    } catch {
      pushToast(
        action === "share"
          ? { tone: "error", title: "Couldn't share the link", message: "Try again." }
          : {
              tone: "error",
              title: "Couldn't open the calendar",
              message: "Use Share link and open it in your calendar app.",
            },
      );
    }
  }

  const manualRefresh = useManualRefresh(() => statusQuery.refetch());
  const contentState = useMobileContentState({
    hasData: Boolean(statusQuery.data),
    isLoading: statusQuery.isLoading,
    error: statusQuery.error,
  });

  const isActive = statusQuery.data?.active ?? false;
  const isBusy = issueMutation.isPending || revokeMutation.isPending;

  function handleAction(action: CalendarAction) {
    if (isBusy) return;
    if (issued) {
      void openIssuedLink(action, issued.feedUrl);
      return;
    }
    if (isActive) {
      setPendingConfirmation({ kind: "replace", action });
      return;
    }
    issueMutation.mutate({ action, mode: "create" });
  }

  async function confirmPendingAction() {
    const pending = pendingConfirmation;
    if (!pending) return;
    setPendingConfirmation(null);
    if (pending.kind === "replace") {
      issueMutation.mutate({ action: pending.action, mode: "rotate" });
    } else {
      revokeMutation.mutate();
    }
  }

  const visibleActions = ACTIONS.filter((entry) => !entry.iosOnly || CAN_OPEN_APPLE_CALENDAR);

  return (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      scrollEnabled={contentState.kind !== "loading"}
    >
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton rowsPerSection={4} sections={1} showHero={false} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Couldn't load calendar subscription"
          variant="centered"
          onAction={() => {
            void statusQuery.refetch();
          }}
        />
      ) : (
        <>
          <ProfileSection
            title="Add to calendar"
            description="Updates automatically. The link is private to you."
          >
            <ProfileList>
              {visibleActions.map((entry, index) => (
                <ProfileNavRow
                  key={entry.action}
                  iconName={entry.iconName}
                  isLast={index === visibleActions.length - 1}
                  label={entry.label}
                  onPress={() => handleAction(entry.action)}
                />
              ))}
            </ProfileList>
          </ProfileSection>

          {isActive ? (
            <ProfileSection>
              <ProfileList>
                <ProfileListAction
                  isLast
                  label="Disable subscription"
                  tone="danger"
                  onPress={() => {
                    if (!isBusy) setPendingConfirmation({ kind: "disable" });
                  }}
                />
              </ProfileList>
            </ProfileSection>
          ) : null}
        </>
      )}

      <ConfirmationModal
        body={
          pendingConfirmation?.kind === "disable"
            ? "Calendar apps stop receiving updates until you add a calendar again."
            : "Any calendar already using the old link stops updating."
        }
        iconName={
          pendingConfirmation?.kind === "disable" ? "close-circle-outline" : "refresh-outline"
        }
        confirmLabel={pendingConfirmation?.kind === "disable" ? "Disable" : "Replace"}
        confirmTone={pendingConfirmation?.kind === "disable" ? "danger" : "primary"}
        loading={isBusy}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={confirmPendingAction}
        title={
          pendingConfirmation?.kind === "disable"
            ? "Disable calendar subscription?"
            : "Replace the existing link?"
        }
        visible={pendingConfirmation != null}
      />
    </Screen>
  );
}
