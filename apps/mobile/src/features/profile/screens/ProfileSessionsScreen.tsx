import { useMemo, useState } from "react";
import type { MobileProfileSession } from "@dubgrid/contracts";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useModalHandoff } from "../../../shared/hooks/useModalHandoff";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { getProfileSessions, revokeProfileSession } from "../../../shared/lib/api";
import {
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
} from "../../../shared/lib/auth-reset";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { Collapsible } from "../../../shared/motion/Collapsible";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileElevation,
  mobileRadii,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { ProfileSection } from "../components/ProfilePrimitives";
import { ProfileSkeleton } from "../components/ProfileSkeleton";
import { SessionDetailSheet } from "../components/SessionDetailSheet";
import { SignOutScopeSheet, type SignOutScope } from "../components/SignOutScopeSheet";
import {
  formatSessionDeviceLabel,
  formatSessionClient,
  formatSessionLastActive,
  formatSessionPlatform,
  formatSessionLocation,
} from "../components/session-format";

type SessionConfirmation =
  { kind: "scope"; scope: SignOutScope } | { kind: "revoke"; session: MobileProfileSession };

/**
 * Every device signed in to this account.
 *
 * Split out of the security page, where it was the fifth section on a screen
 * that also held three editors. The two bulk sign-outs have moved from above
 * the list (leading with the destructive actions) to below it, behind
 * `SignOutScopeSheet`; per-session detail and revoke have moved into
 * `SessionDetailSheet`; and stale sessions are collapsed by default rather
 * than printed as a second, actionless list.
 */
export default function ProfileSessionsScreen() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const handoff = useModalHandoff();
  const [openSession, setOpenSession] = useState<MobileProfileSession | null>(null);
  const [isScopeSheetVisible, setScopeSheetVisible] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<SessionConfirmation | null>(null);
  const [sessionScopeLoading, setSessionScopeLoading] = useState<SignOutScope | null>(null);
  const [isStaleOpen, setStaleOpen] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["mobile", "profile", "sessions", accessToken],
    queryFn: () => getProfileSessions(accessToken!),
    enabled: Boolean(accessToken),
  });
  const revokeMutation = useMutation({
    mutationFn: (refreshTokenHash: string) => revokeProfileSession(accessToken!, refreshTokenHash),
    onSuccess: async () => {
      await sessionsQuery.refetch();
      pushToast({
        tone: "success",
        title: "Session revoked",
        message: "That device is signed out.",
      });
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not revoke session",
        fallbackMessage: "We couldn't revoke that session right now.",
      });
    },
  });
  const manualRefresh = useManualRefresh(() => sessionsQuery.refetch());
  const contentState = useMobileContentState({
    hasData: Boolean(sessionsQuery.data),
    isLoading: sessionsQuery.isLoading,
    error: sessionsQuery.error,
  });

  const active = sessionsQuery.data?.active ?? [];
  const stale = sessionsQuery.data?.stale ?? [];
  const hasOtherActiveSession = active.some((session) => !session.isCurrent);

  async function handleSessionAction(scope: SignOutScope) {
    if (sessionScopeLoading) {
      return;
    }

    setSessionScopeLoading(scope);
    try {
      if (scope === "global") {
        // This device is about to lose its session too, so stop its pushes
        // while the token is still valid.
        await disablePushForCurrentDevice();
      }

      const result = await getSupabaseClient().auth.signOut({ scope });
      if (result.error) {
        pushClientFriendlyErrorToast(pushToast, {
          error: result.error,
          title: "Could not update sessions",
          fallbackMessage: "We couldn't update your sessions right now.",
        });
        return;
      }

      if (scope === "global") {
        await handleExpiredMobileSession({ skipSignOut: true });
      } else {
        await sessionsQuery.refetch();
      }
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update sessions",
        fallbackMessage: "We couldn't update your sessions right now.",
      });
    } finally {
      setSessionScopeLoading(null);
    }
  }

  function confirmSessionAction(): Promise<void> | undefined {
    const action = pendingConfirmation;
    setPendingConfirmation(null);
    if (!action) return;

    if (action.kind === "scope") {
      // One modal at a time: the confirmation has already gone, the sheet
      // follows once it has finished leaving. Tearing both down in one commit
      // is the case iOS drops, which left the scope sheet up over a signed-out
      // app. The sign-out still runs after the sheet is closed, which is what
      // the same-tick version was for — a global sign-out tears the session
      // down underneath whatever is still mounted over it.
      handoff(() => {
        setScopeSheetVisible(false);
        void handleSessionAction(action.scope);
      });
      return;
    }

    handoff(() => setOpenSession(null));
    return revokeMutation.mutateAsync(action.session.refreshTokenHash).then(
      () => undefined,
      () => undefined,
    );
  }

  const isScopeConfirmation = pendingConfirmation?.kind === "scope";
  const isGlobalConfirmation = isScopeConfirmation && pendingConfirmation.scope === "global";
  const confirmationTitle = isGlobalConfirmation
    ? "Sign out all devices?"
    : isScopeConfirmation
      ? "Sign out other devices?"
      : "Sign out this device?";
  const confirmationBody = isGlobalConfirmation
    ? "Every device, including this one, will be signed out."
    : isScopeConfirmation
      ? "Every device except this one will be signed out."
      : `${pendingConfirmation?.kind === "revoke" ? formatSessionDeviceLabel(pendingConfirmation.session) : "This device"} will lose access immediately.`;

  return (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      scrollEnabled={contentState.kind !== "loading"}
    >
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton rowVariant="nav" rowsPerSection={3} sections={1} showHero={false} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load sessions"
          variant="centered"
          onAction={() => {
            void sessionsQuery.refetch();
          }}
        />
      ) : (
        <>
          <ProfileSection
            title="Signed in"
            description="Tap a device to see where it signed in from, or to sign it out."
          >
            {active.length === 0 ? (
              <EmptyStateCard
                compact
                body="We couldn't find any active sessions for this account."
                iconName="phone-portrait-outline"
                title="No devices signed in"
              />
            ) : (
              <View style={styles.sessionList}>
                {active.map((session, index) => (
                  <SessionRow
                    key={session.id}
                    isLast={index === active.length - 1}
                    session={session}
                    onPress={() => setOpenSession(session)}
                  />
                ))}
              </View>
            )}
          </ProfileSection>

          {stale.length > 0 ? (
            <ProfileSection>
              <View style={styles.sessionList}>
                <PressableRow
                  accessibilityLabel={`Inactive devices (${stale.length})`}
                  style={[styles.disclosureRow, isStaleOpen && styles.sessionRowDivider]}
                  onPress={() => setStaleOpen((open) => !open)}
                >
                  <Text style={styles.disclosureLabel}>Inactive devices ({stale.length})</Text>
                  <Ionicons
                    color={mobileColors.textSubtle}
                    name={isStaleOpen ? "chevron-up" : "chevron-down"}
                    size={20}
                  />
                </PressableRow>
                <Collapsible open={isStaleOpen}>
                  {stale.map((session, index) => (
                    <SessionRow
                      key={session.id}
                      isLast={index === stale.length - 1}
                      session={session}
                      onPress={() => setOpenSession(session)}
                    />
                  ))}
                </Collapsible>
              </View>
            </ProfileSection>
          ) : null}

          {/* Below the list, not above it: the page should open on what is
              signed in, not on the two ways to sign everything out. */}
          <ProfileSection>
            <Button
              label="Signing out devices"
              loading={sessionScopeLoading != null}
              onPress={() => setScopeSheetVisible(true)}
              tone="secondary"
            />
          </ProfileSection>
        </>
      )}

      <SessionDetailSheet
        revoking={revokeMutation.isPending}
        session={openSession}
        onDismiss={() => setOpenSession(null)}
        onRevoke={(session) => setPendingConfirmation({ kind: "revoke", session })}
      />
      <SignOutScopeSheet
        hasOtherSessions={hasOtherActiveSession}
        visible={isScopeSheetVisible}
        onDismiss={() => setScopeSheetVisible(false)}
        onSelect={(scope) => setPendingConfirmation({ kind: "scope", scope })}
      />
      <ConfirmationModal
        body={confirmationBody}
        confirmLabel="Sign Out"
        confirmTone="danger"
        loading={revokeMutation.isPending || sessionScopeLoading != null}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={confirmSessionAction}
        title={confirmationTitle}
        visible={pendingConfirmation != null}
      />
    </Screen>
  );
}

function SessionRow({
  session,
  isLast,
  onPress,
}: {
  session: MobileProfileSession;
  isLast: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const label = formatSessionDeviceLabel(session);

  return (
    <PressableRow
      accessibilityLabel={label}
      style={[styles.sessionRow, !isLast && styles.sessionRowDivider]}
      onPress={onPress}
    >
      <View style={styles.sessionIcon}>
        <Text style={styles.sessionIconText}>{formatSessionPlatform(session.platform)}</Text>
      </View>
      <View style={styles.sessionCopy}>
        <View style={styles.sessionTitleRow}>
          <Text numberOfLines={1} style={styles.sessionTitle}>
            {label}
          </Text>
          {session.isCurrent ? (
            <View style={styles.sessionCurrentBadge}>
              <Text style={styles.sessionCurrentBadgeText}>This device</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sessionBody}>{formatSessionClient(session)}</Text>
        <Text numberOfLines={1} style={styles.sessionBody}>
          {formatSessionLocation(session)}
        </Text>
        <Text style={styles.sessionBody}>{formatSessionLastActive(session.lastActiveAt)}</Text>
      </View>
      <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={22} />
    </PressableRow>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    sessionList: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      overflow: "hidden",
      ...mobileElevation("card", isDark),
    },
    sessionRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: 112,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    sessionRowDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sessionIcon: {
      alignItems: "center",
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.borderSubtle,
      borderRadius: 18,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    sessionIconText: {
      ...mobileText.micro,
      color: mobileColors.textSecondary,
    },
    sessionCopy: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    sessionTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minWidth: 0,
    },
    sessionTitle: {
      ...mobileTextWeighted("rowTitle", "medium"),
      color: mobileColors.textPrimary,
      flexShrink: 1,
      minWidth: 0,
    },
    sessionCurrentBadge: {
      backgroundColor: mobileColors.brand,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    sessionCurrentBadgeText: {
      ...mobileTextWeighted("micro", "bold"),
      color: mobileColors.textInverse,
    },
    sessionBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    disclosureRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      justifyContent: "space-between",
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    disclosureLabel: {
      ...mobileTextWeighted("cardTitle", "medium"),
      color: mobileColors.textPrimary,
    },
  });
