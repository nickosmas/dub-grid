import { router, Stack } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { MobileProfileChangeRequest } from "@dubgrid/contracts";
import { getOrgRoleLabel } from "@dubgrid/domain";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppText } from "../../../shared/components/AppText";
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Screen } from "../../../shared/components/Screen";
import { SelectionCheck } from "../../../shared/components/SelectionCheck";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useModalHandoff } from "../../../shared/hooks/useModalHandoff";
import {
  getProfile,
  getProfileChangeRequests,
  updateProfileChangeRequest,
} from "../../../shared/lib/api";
import {
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
} from "../../../shared/lib/auth-reset";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { getMobileAuthIdentity } from "../../../shared/lib/access-token";
import { saveLastOrg } from "../../../shared/lib/session";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { replaceAuthSession } from "../../../shared/providers/AuthSessionProvider";
import {
  mobileMotion,
  mobileRadii,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  mobileTypography,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useMotionPreference } from "../../../shared/motion/useMotionPreference";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useMobileColors, useThemeMode } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { queryClient } from "../../../shared/lib/query-client";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { getAvatarTone } from "../../../shared/lib/avatar-tone";
import {
  getDepartmentNames,
  getScheduledDepartmentNames,
  MANAGEMENT_DEPARTMENT_LABELS,
} from "../../../shared/lib/departments";
import { getMobileOrgRoleHeroBadge } from "../../people/lib/orgRoleBadges";
import {
  getProfileInitials,
  ProfileHero,
  ProfileIcon,
  ProfileInfoRow,
  ProfileList,
  ProfileNavRow,
  ProfileSection,
  formatProfileValue,
} from "../components/ProfilePrimitives";
import { PendingRequestsCard } from "../components/PendingRequestsCard";
import { AppearanceSheet, getThemePreferenceLabel } from "../components/AppearanceSheet";
import { ProfileSkeleton } from "../components/ProfileSkeleton";

type OrganizationSwitchClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
};
type OrganizationMembershipOption = {
  id: string;
  slug: string | null;
  name?: string | null;
  isCurrent: boolean;
};
type ProfileConfirmation =
  | { kind: "logout"; force?: boolean }
  | { kind: "switch-org"; force?: undefined; membership: OrganizationMembershipOption };

/** How far the selected organization row is lifted off the group's edges. */
const ORG_OPTION_INSET = 6;

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProfileScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { preference, resolvedTheme } = useThemeMode();
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const handoff = useModalHandoff();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSwitchModalVisible, setIsSwitchModalVisible] = useState(false);
  const [switchingOrg, setSwitchingOrg] = useState<OrganizationMembershipOption | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<ProfileConfirmation | null>(null);
  const [isAppearanceSheetVisible, setIsAppearanceSheetVisible] = useState(false);
  const [isCompactTitleVisible, setIsCompactTitleVisible] = useState(false);
  const switchInFlightRef = useRef(false);
  const profileQuery = useQuery({
    queryKey: mobileQueryKeys.profile(accessToken),
    queryFn: ({ signal }) => getProfile(accessToken!, signal),
    enabled: Boolean(accessToken),
  });
  const changeRequestsQuery = useQuery({
    queryKey: mobileQueryKeys.profileChangeRequests(accessToken),
    queryFn: ({ signal }) => getProfileChangeRequests(accessToken!, signal),
    enabled: Boolean(accessToken),
  });
  const bootstrapQuery = useBootstrap(accessToken);
  const manualRefresh = useManualRefresh(() =>
    Promise.all([profileQuery.refetch(), changeRequestsQuery.refetch(), bootstrapQuery.refetch()]),
  );
  const pendingChangeRequests: MobileProfileChangeRequest[] =
    changeRequestsQuery.data?.requests.filter((request) => request.status === "pending") ?? [];
  const cancelChangeRequestMutation = useMutation({
    mutationFn: (request: MobileProfileChangeRequest) =>
      updateProfileChangeRequest(accessToken!, request.id, { action: "cancel" }),
    onSuccess: async (_data, request) => {
      pushToast({
        tone: "success",
        message:
          request.type === "account_deletion"
            ? "Account deletion request cancelled."
            : "Name change request cancelled.",
      });
      await Promise.all([changeRequestsQuery.refetch(), profileQuery.refetch()]);
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        fallbackMessage: "We couldn't cancel that request right now.",
        title: "Could not cancel request",
      });
    },
  });
  const profile = profileQuery.data ?? null;
  const contentState = useMobileContentState({
    // Bootstrap sits in all three halves now that the management section reads
    // department names from it. Gating on the profile alone would paint that
    // section with its departments still unresolved, and leaving bootstrap out
    // of `hasData` while naming it in `isLoading` would land the screen on the
    // "Profile unavailable" card the moment bootstrap outlives the profile.
    hasData: Boolean(profile) && bootstrapQuery.data !== undefined,
    isLoading: profileQuery.isLoading || bootstrapQuery.isLoading,
    error: profileQuery.error ?? bootstrapQuery.error,
  });
  const displayName =
    [profile?.user.firstName, profile?.user.lastName].filter(Boolean).join(" ").trim() ||
    profile?.user.email ||
    "App user";
  const memberships = bootstrapQuery.data?.memberships ?? [];
  const canSwitchOrganizations = memberships.length > 1;
  // The hero's own badge, shared with both person pages: `ProfileHero` draws
  // the pill, so all this decides is the label and the tone.
  const orgRoleBadge = getMobileOrgRoleHeroBadge(profile?.effectiveRole);
  // Account id, matching every other surface. Seeding off the linked employee
  // gave the same person a different color here than on the web header.
  const avatarSeed = profile?.user.id ?? "";
  const avatarTone = avatarSeed ? getAvatarTone(avatarSeed, resolvedTheme === "dark") : null;
  const departmentLabel = profile?.currentOrg.labels.department ?? "Departments";
  // A management user is someone whose membership carries departments — an org
  // role doesn't make one, and plenty of admins manage nothing.
  const managementDepartmentNames = getDepartmentNames(
    profile?.managementDepartmentIds ?? [],
    bootstrapQuery.data?.departments,
  );
  const scheduledDepartmentNames = getScheduledDepartmentNames(
    profile?.linkedEmployee?.focusAreaIds ?? [],
    bootstrapQuery.data?.focusAreas ?? profile?.focusAreas,
    bootstrapQuery.data?.departments,
  );

  async function handleLogout() {
    setIsSigningOut(true);

    try {
      await disablePushForCurrentDevice();

      const { error } = await getSupabaseClient().auth.signOut({
        scope: "local",
      });
      if (error) {
        pushClientFriendlyErrorToast(pushToast, {
          error,
          title: "Could not sign out",
          fallbackMessage: "We couldn't sign you out right now. Try again in a moment.",
        });
        return;
      }

      await handleExpiredMobileSession({ skipSignOut: true });
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not sign out",
        fallbackMessage: "We couldn't sign you out right now. Try again in a moment.",
      });
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleSwitchOrganization(input: OrganizationMembershipOption) {
    if (input.isCurrent || switchInFlightRef.current) {
      return;
    }

    switchInFlightRef.current = true;
    // The whole membership, not just its id: the overlay below names the org
    // being switched to, and `memberships` is about to be thrown away with the
    // rest of the previous org's cached data.
    setSwitchingOrg(input);

    let serverOrganizationChanged = false;

    const failClosedAfterServerSwitch = async (error: unknown) => {
      // The RPC already changed the server-side active organization, so the
      // previous token and cache can no longer be offered as an interactive
      // recovery state. Tear them down immediately and return to sign-in.
      await queryClient.cancelQueries().catch(() => undefined);
      queryClient.clear();
      pushClientFriendlyErrorToast(pushToast, {
        error,
        fallbackMessage: "Sign in again to finish switching organizations.",
        title: "Could not finish organization switch",
      });
      await handleExpiredMobileSession();
    };

    try {
      const supabase = getSupabaseClient();
      const organizationClient = supabase as unknown as OrganizationSwitchClient;
      const switchResult = await organizationClient.rpc("switch_org", {
        target_org_id: input.id,
      });

      if (switchResult.error) {
        pushClientFriendlyErrorToast(pushToast, {
          error: switchResult.error,
          fallbackMessage: "We couldn't switch organizations right now.",
          title: "Could not switch organization",
        });
        return;
      }
      serverOrganizationChanged = true;

      const refreshResult = await supabase.auth.refreshSession();
      if (refreshResult.error || !refreshResult.data.session) {
        await failClosedAfterServerSwitch(
          refreshResult.error ?? new Error("The refreshed session was unavailable."),
        );
        return;
      }

      const refreshedIdentity = getMobileAuthIdentity(refreshResult.data.session.access_token);
      if (refreshedIdentity.kind !== "authenticated" || refreshedIdentity.orgId !== input.id) {
        await failClosedAfterServerSwitch(
          new Error("The refreshed session did not match the selected organization."),
        );
        return;
      }

      // Drop the previous org's data outright rather than marking it stale —
      // `invalidateQueries` keeps rendering the old rows until each refetch
      // lands, which flashes another tenant's people and schedule. Web resets
      // just as hard (clear + hard navigation) for the same reason. Resetting
      // to Home also re-derives tab visibility from the new bootstrap instead
      // of leaving the old org's tabs on screen.
      //
      // This runs the instant the session moves, before anything that can fail.
      // `saveLastOrg` used to sit above it, so a rejected SecureStore write
      // threw past BOTH the reset and the navigation, leaving the new org's
      // token pointed at the previous org's fully populated cache — the exact
      // state the reset exists to prevent.
      // `replace` only rewrites the active navigator, so a person or shift
      // detail route pushed under the old org survives in its own tab's
      // history. That is deliberate rather than overlooked: every mobile read
      // is scoped server-side to the token's org (`auth.currentOrg.id`), and
      // every authenticated query key carries the stable user-and-org identity,
      // so such a route refetches under the new session and 404s. It fails
      // closed and cannot render the previous organization's row.
      // Commit the exact refreshed session ourselves instead of waiting for a
      // later auth-state event. The provider clears/cancels the old identity's
      // queries synchronously at this boundary, and only then can Home mount.
      if (!replaceAuthSession(refreshResult.data.session)) {
        await failClosedAfterServerSwitch(new Error("The authenticated session is unavailable."));
        return;
      }
      router.replace("/(tabs)/home");

      // Last, and deliberately not awaited into the critical path: remembering
      // the org for the next launch is a convenience, and it must never be able
      // to hold up (or cancel) the teardown above. It still needs its own
      // catch — `setStoredValue` does not swallow SecureStore failures, and an
      // unhandled rejection is a red box in dev over a write nobody is waiting
      // on. Worst case the next launch offers the previous org's slug.
      saveLastOrg({ slug: input.slug, name: input.name }).catch(() => {});
    } catch (error) {
      if (serverOrganizationChanged) {
        await failClosedAfterServerSwitch(error);
      } else {
        pushClientFriendlyErrorToast(pushToast, {
          error,
          fallbackMessage: "We couldn't switch organizations right now.",
          title: "Could not switch organization",
        });
      }
    } finally {
      // Cleared on success too, in the same commit as the navigation away: a
      // latched overlay would still be up if the user came back to this tab.
      setSwitchingOrg(null);
      switchInFlightRef.current = false;
    }
  }

  function confirmProfileAction(): Promise<void> | undefined {
    const action = pendingConfirmation;
    setPendingConfirmation(null);
    if (!action) return;

    if (action.kind === "switch-org") {
      // The picker already left before this confirmation was presented. Let
      // the confirmation finish leaving before the refreshSession() cascade
      // starts so no previous-organization surface remains mounted over it.
      handoff(() => {
        void handleSwitchOrganization(action.membership);
      });
      return;
    }

    return handleLogout();
  }

  const isSwitchConfirmation = pendingConfirmation?.kind === "switch-org";
  const confirmationTitle = isSwitchConfirmation
    ? "Switch organization?"
    : pendingConfirmation?.force
      ? "Force sign out?"
      : "Sign out?";
  const confirmationBody = isSwitchConfirmation
    ? `You'll switch to ${pendingConfirmation.membership.name ?? "this organization"}.`
    : pendingConfirmation?.force
      ? "You'll be signed out immediately, even if data hasn't synced."
      : "You'll be signed out on this device.";
  const confirmationLabel = isSwitchConfirmation ? "Switch" : "Sign Out";

  function handleProfileScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // Keep the hero as the identity at rest. Once it begins to pass under the
    // native bar, UIKit's scroll-edge effect takes over and the compact title
    // gives the page a stable identity. A small threshold prevents the title
    // flickering during the scroll view's elastic resting bounce.
    const nextVisible = event.nativeEvent.contentOffset.y > 12;
    setIsCompactTitleVisible((visible) => (visible === nextVisible ? visible : nextVisible));
  }

  return (
    <Screen
      bottomPaddingMode="tabbed"
      onScroll={handleProfileScroll}
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      // A skeleton is a placeholder, not content: it must not scroll, and there
      // is nothing to pull-to-refresh while the thing is already loading.
      // Everything else scrolls — `Screen`'s `flexGrow: 1` gives a `fillScreen`
      // state real space to centre in without leaving scroll mode.
      scrollEnabled={contentState.kind !== "loading"}
      scrollEventThrottle={16}
      // Passed only while a switch is in flight: `renderOverlay` costs the
      // screen its native scroll root, which is what drives the iOS large
      // title, so this screen must not hold one open the rest of the time.
      renderOverlay={
        switchingOrg
          ? () => <OrganizationSwitchOverlay name={switchingOrg.name ?? "your organization"} />
          : undefined
      }
    >
      {contentState.kind === "loading" ? (
        // Nothing at all for a blip: a skeleton that appears and vanishes
        // inside a few frames reads as a glitch, not as loading.
        contentState.showSkeleton ? (
          <ProfileSkeleton
            heroAlign="center"
            heroChips={1}
            heroSubtitle
            metaItems={0}
            rowsPerSection={3}
            sections={3}
          />
        ) : null
      ) : contentState.kind === "error" ? (
        <>
          <StatusBanner
            actionLabel="Try again"
            body={contentState.message}
            fillScreen
            title="Could not load profile"
            variant="centered"
            onAction={() => {
              void profileQuery.refetch();
            }}
          />
          {accessToken ? (
            <Button
              label="Force Sign Out"
              loading={isSigningOut}
              onPress={() => {
                setPendingConfirmation({ kind: "logout", force: true });
              }}
              tone="neutral"
            />
          ) : null}
        </>
      ) : contentState.kind === "empty" || !profile ? (
        <EmptyStateCard
          fillScreen
          body="We couldn't load your account details. Try signing out and back in."
          iconName="person-circle-outline"
          title="Profile unavailable"
        />
      ) : (
        <>
          {/* The native inline header is deliberately the person, not the tab.
              It stays compact and gets UIKit's scroll-edge blur from the route
              while this hero scrolls beneath it. */}
          <Stack.Screen
            options={{
              // Keep a real native title so UIKit never falls back to the tab
              // label or renders an empty-title placeholder. Its colour alone
              // changes when the hero passes beneath the scroll-edge bar.
              title: displayName,
              headerTitleStyle: {
                color: isCompactTitleVisible ? mobileColors.textPrimary : "transparent",
                fontFamily: mobileTypography.fontFamily.bold,
              },
            }}
          />
          {/* Centered, the same way both person pages are: this page's subject is
              a person, and a left-aligned 64pt avatar reads as a settings row
              rather than as the heading it is. */}
          <ProfileHero
            align="center"
            avatarStyle={
              avatarTone
                ? {
                    backgroundColor: avatarTone.backgroundColor,
                    borderColor: avatarTone.borderColor,
                    borderWidth: 1,
                  }
                : undefined
            }
            avatarTextStyle={avatarTone ? { color: avatarTone.textColor } : undefined}
            badge={orgRoleBadge.label}
            badgeTone={orgRoleBadge.tone}
            initials={getProfileInitials(displayName)}
            orgRole={profile.effectiveRole}
            title={displayName}
            subtitle={profile.user.email || "No email on file"}
            style={{ paddingBottom: 16 }}
          >
            {/* One quiet line, where a three-cell grid used to sit. The
                organization moved down to the section named after it and the
                phone number lives on "Profile details", so the grid was mostly
                restating things the page says better further down — and a
                stat strip is the wrong weight for a heading anyway. */}
            <AppText align="center" tone="subtle" variant="meta">
              {`Joined ${formatDate(profile.user.createdAt)}`}
            </AppText>
          </ProfileHero>

          <PendingRequestsCard
            requests={pendingChangeRequests}
            cancellingId={
              cancelChangeRequestMutation.isPending
                ? (cancelChangeRequestMutation.variables?.id ?? null)
                : null
            }
            onCancel={(request) =>
              new Promise<void>((resolve) => {
                cancelChangeRequestMutation.mutate(request, { onSettled: () => resolve() });
              })
            }
          />

          {/* Where you are, and nothing more: the staff status and focus areas
              that used to sit here are the "Profile details" page's own "Staff
              profile" section. The hub says where you are; the detail pages
              hold the detail. The name is a row again now that the hero's meta
              grid is gone — "Switch organization" below carries it too, but
              only for the people who have somewhere to switch to. */}
          <ProfileSection title="Organization">
            <ProfileList>
              <ProfileInfoRow
                iconName="business-outline"
                label="Name"
                value={profile.currentOrg.name}
              />
              <ProfileInfoRow
                iconName="compass-outline"
                isLast
                label="Subdomain"
                value={formatProfileValue(profile.currentOrg.slug)}
              />
            </ProfileList>
          </ProfileSection>

          {/* Where you sit in the org, which is the hub's own subject — the
              staff detail it used to be tangled with stays on "Profile
              details". Both kinds get a row: where you are scheduled and what
              you manage are different facts, and plenty of people have one
              without the other. */}
          {scheduledDepartmentNames.length > 0 || managementDepartmentNames.length > 0 ? (
            <ProfileSection title="Departments">
              <ProfileList>
                {scheduledDepartmentNames.length > 0 ? (
                  <ProfileInfoRow
                    iconName="business-outline"
                    isLast={managementDepartmentNames.length === 0}
                    label={departmentLabel}
                    value={scheduledDepartmentNames.join(", ")}
                  />
                ) : null}
                {managementDepartmentNames.length > 0 ? (
                  <ProfileInfoRow
                    iconName="briefcase-outline"
                    isLast
                    label={MANAGEMENT_DEPARTMENT_LABELS.plural}
                    value={managementDepartmentNames.join(", ")}
                  />
                ) : null}
              </ProfileList>
            </ProfileSection>
          ) : null}

          {/* "Settings", not "Details": the first row in this list is itself
              called "Profile details", so that heading read as a section about
              one of its own rows. */}
          <ProfileSection title="Settings">
            <ProfileList>
              <ProfileNavRow
                iconName="id-card-outline"
                label="Profile details"
                onPress={() => router.push("/(tabs)/profile/work")}
              />
              <ProfileNavRow
                iconName="lock-closed-outline"
                label="Security & sessions"
                onPress={() => router.push("/(tabs)/profile/security")}
              />
              <ProfileNavRow
                iconName="notifications-outline"
                label="Notifications"
                onPress={() => router.push("/(tabs)/profile/notifications")}
              />
              <ProfileNavRow
                iconName="shield-outline"
                label="Privacy & data"
                onPress={() => router.push("/(tabs)/profile/privacy")}
              />
              <ProfileNavRow
                iconName="color-palette-outline"
                isLast={!canSwitchOrganizations}
                label="Appearance"
                value={getThemePreferenceLabel(preference)}
                onPress={() => setIsAppearanceSheetVisible(true)}
              />
              {/* A row, not a button beside Sign Out: switching organizations
                  opens a picker, exactly like Appearance does, and pairing it
                  with the one genuinely destructive action made the two read as
                  equals. */}
              {canSwitchOrganizations ? (
                <ProfileNavRow
                  iconName="swap-horizontal-outline"
                  isLast
                  label="Switch organization"
                  value={profile.currentOrg.name}
                  onPress={() => setIsSwitchModalVisible(true)}
                />
              ) : null}
            </ProfileList>
          </ProfileSection>

          {/* Untitled: the button says "Sign Out", so a heading over it can only
              restate it more vaguely. Set apart from the settings list above it
              by more than the shared section gap, the same way the person
              page sets its action stack off from the sections above it: at the
              standard 20 the one destructive action on the screen reads as the
              last row of that list, close enough to be hit on the way past. */}
          <ProfileSection style={styles.signOutSection}>
            <Button
              label="Sign Out"
              loading={isSigningOut}
              onPress={() => {
                setPendingConfirmation({ kind: "logout" });
              }}
              tone="neutral"
            />
          </ProfileSection>

          <BottomSheetModal
            header={<SheetHeader title="Switch organization" />}
            scrollable
            visible={isSwitchModalVisible}
            onDismiss={() => setIsSwitchModalVisible(false)}
          >
            <ProfileList>
              {memberships.map((membership, index) => (
                <OrganizationOptionRow
                  key={membership.id}
                  membership={membership}
                  // No rule against the selected row on either side: it lifts
                  // off the group as its own card, and a hairline running into
                  // its rounded edge would undo exactly that.
                  showDivider={
                    index < memberships.length - 1 &&
                    !membership.isCurrent &&
                    !memberships[index + 1]?.isCurrent
                  }
                  onPress={() => {
                    // UIKit will not present the confirmation over an existing
                    // native sheet. Close the picker first, then present the
                    // confirmation after its dismissal animation finishes.
                    setIsSwitchModalVisible(false);
                    handoff(() => setPendingConfirmation({ kind: "switch-org", membership }));
                  }}
                />
              ))}
            </ProfileList>
          </BottomSheetModal>
        </>
      )}
      <ConfirmationModal
        body={confirmationBody}
        confirmLabel={confirmationLabel}
        confirmTone={isSwitchConfirmation ? "primary" : "danger"}
        loading={isSigningOut}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={confirmProfileAction}
        title={confirmationTitle}
        visible={pendingConfirmation != null}
      />
      <AppearanceSheet
        visible={isAppearanceSheetVisible}
        onDismiss={() => setIsAppearanceSheetVisible(false)}
      />
    </Screen>
  );
}

/**
 * The switch itself is two network round trips (the RPC, then the session
 * refresh) with a cache wipe and a tab reset behind them, and the picker that
 * raised it is already closed by the time any of that starts — see
 * `confirmProfileAction`. Without this the screen simply sat there showing the
 * org being left, then jumped to Home.
 *
 * Opaque and touch-blocking on purpose: everything underneath still belongs to
 * the previous organization, so it must neither show through nor be pressable
 * while the session it was fetched under is being replaced.
 */
function OrganizationSwitchOverlay({ name }: { name: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { d } = useMotionPreference();

  return (
    <Animated.View
      accessibilityLabel={`Switching to ${name}`}
      accessible
      entering={FadeIn.duration(d(mobileMotion.duration.fast))}
      style={styles.switchOverlay}
    >
      <ActivityIndicator color={mobileColors.brand} size="large" />
      <AppText align="center" variant="cardTitle">{`Switching to ${name}`}</AppText>
      <AppText align="center" tone="muted" variant="body">
        We're loading everything for this organization.
      </AppText>
    </Animated.View>
  );
}

function OrganizationOptionRow({
  membership,
  showDivider,
  onPress,
}: {
  membership: {
    id: string;
    slug: string | null;
    isCurrent: boolean;
    name?: string;
    orgRole?: string | null;
  };
  showDivider: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const name = membership.name ?? "Organization";
  // The role label the rest of the app uses, not the raw `admin`/`user` enum,
  // and the app's own separator rather than a hyphen — which was ambiguous
  // against slugs that are themselves hyphenated ("dubgrid-health - admin").
  const meta = [membership.slug ?? "organization", getOrgRoleLabel(membership.orgRole)]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <>
      {/* Every row keeps the building glyph and the selected one tints its
          tile brand, so the icon column stays scannable. Swapping the glyph
          itself for a bare checkmark left the current row as the only one
          without an organization icon. */}
      <ProfileIcon name="business-outline" tone={membership.isCurrent ? "brand" : undefined} />
      <View style={styles.orgOptionCopy}>
        <Text
          numberOfLines={1}
          style={[styles.orgOptionName, membership.isCurrent && styles.orgOptionNameCurrent]}
        >
          {name}
        </Text>
        <Text numberOfLines={1} style={styles.orgOptionMeta}>
          {meta}
        </Text>
      </View>
      {/* The row's own accessibilityLabel already says "current organization",
          so the mark is decorative here. */}
      {membership.isCurrent ? <SelectionCheck /> : null}
    </>
  );

  // The current organization is a status, not an option: rendering it as a
  // disabled row would fade the one row that should read strongest, and
  // rendering it pressable would fire a selection haptic for a press that
  // can't do anything.
  if (membership.isCurrent) {
    return (
      <View style={styles.orgOptionSlot}>
        <View
          accessibilityLabel={`${name}, current organization`}
          style={[styles.orgOptionRow, styles.orgOptionCurrent]}
        >
          {body}
        </View>
      </View>
    );
  }

  // Two boxes on purpose. The outer slot is full-bleed and owns the divider, so
  // the list keeps its flush grouped look. The inner box is the inset, rounded,
  // `overflow: hidden` surface — which is what gives the press highlight and the
  // Android ripple the same rounded shape the selected row has, instead of a
  // square band spanning the whole group.
  return (
    <View style={[styles.orgOptionSlot, showDivider && styles.orgOptionDivider]}>
      <PressableRow accessibilityLabel={name} style={styles.orgOptionRow} onPress={onPress}>
        {body}
      </PressableRow>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    /**
     * The full-bleed box a row occupies. Carries the divider and nothing else,
     * so the list reads as one flush group.
     */
    orgOptionSlot: {},
    /**
     * The row's own surface, inset inside its slot and fully rounded. Every row
     * has this shape; on an unselected row it is simply transparent until
     * something paints it, which is what makes the press highlight and the
     * Android ripple round rather than a square band across the group.
     *
     * `overflow: hidden` is what clips the ripple to the radius on Android —
     * without it the ripple ignores `borderRadius` entirely.
     */
    orgOptionRow: {
      alignItems: "center",
      borderRadius: mobileRadii.control,
      flexDirection: "row",
      gap: 12,
      margin: ORG_OPTION_INSET,
      minHeight: 70,
      overflow: "hidden",
      // The inset is taken back out of the horizontal padding so the icon and
      // the text stay on the same vertical lines the flush rows used, rather
      // than being shunted inward by the margin.
      paddingHorizontal: 16 - ORG_OPTION_INSET,
      paddingVertical: 12,
    },
    orgOptionCurrent: {
      // A control fill, not `surfaceSecondary`: these rows sit on `surface`
      // inside the sheet, where that token is all but invisible — the selected
      // row was carrying its selection almost entirely in the word "Selected".
      // Paired with the shared inset shape above, this is the one row that
      // reads as its own item rather than a band spanning the group.
      backgroundColor: mobileColors.controlSecondaryBg,
    },
    orgOptionDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    orgOptionCopy: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    orgOptionName: {
      ...mobileTextWeighted("cardTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    orgOptionNameCurrent: {
      ...mobileTextWeighted("cardTitle", "semibold"),
    },
    orgOptionMeta: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    signOutSection: {
      // Twice the 12 the person page's `actionStack` opens above its buttons,
      // on top of the 20 the screen already puts between sections. Sign Out
      // ends the screen rather than sitting among sibling actions, so it takes
      // the wider break.
      paddingTop: mobileSpace["2xl"],
    },
    switchOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      gap: mobileSpace.md,
      paddingHorizontal: mobileSpace.xl,
      // `background`, not `surface`: this stands in for the whole page, and it
      // has to be opaque or the org being left reads through it.
      backgroundColor: mobileColors.background,
    },
  });
