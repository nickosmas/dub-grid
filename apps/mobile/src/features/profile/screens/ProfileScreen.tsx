import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { Card, Screen } from "../../../shared/components/Screen";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import { registerPushToken } from "../../../shared/lib/api";
import { handleExpiredMobileSession } from "../../../shared/lib/auth-reset";
import { queryClient } from "../../../shared/lib/query-client";
import {
  getMobileQueryContentState,
  getQueryErrorMessage,
} from "../../../shared/lib/query-state";
import {
  loadStoredPushDevice,
  saveLastWorkspaceSlug,
} from "../../../shared/lib/session";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { mobileColors, mobileRadii } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { usePushRegistration } from "../../notifications/hooks/usePushRegistration";

type NotificationCategory = "schedule" | "shift_requests" | "system";
type CategoryPrefs = {
  in_app: boolean;
  email: boolean;
};
type NotificationPrefs = Record<NotificationCategory, CategoryPrefs>;

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  schedule: { in_app: true, email: false },
  shift_requests: { in_app: true, email: false },
  system: { in_app: true, email: false },
};

const NOTIFICATION_CATEGORY_COPY: Record<
  NotificationCategory,
  { label: string; description: string }
> = {
  schedule: {
    label: "Schedule changes",
    description: "Published schedules and shift updates.",
  },
  shift_requests: {
    label: "Shift requests",
    description: "New, approved, and rejected request activity.",
  },
  system: {
    label: "System notices",
    description: "Role changes and platform notices.",
  },
};

type MobileNotificationPrefsInput = Partial<
  Record<NotificationCategory, Partial<CategoryPrefs>>
>;
type SupabaseMessageError = {
  message: string;
} | null;
type NotificationPrefsClient = {
  from?: (table: string) => {
    select: (value: string) => {
      eq: (column: string, queryValue: string) => {
        maybeSingle: () => Promise<{
          data: { prefs?: MobileNotificationPrefsInput } | null;
          error: SupabaseMessageError;
        }>;
      };
    };
    upsert: (
      payload: {
        user_id: string;
        prefs: NotificationPrefs;
        updated_at: string;
      },
      options?: {
        onConflict?: string;
      },
    ) => Promise<{
      error: SupabaseMessageError;
    }>;
  };
};
type WorkspaceSwitchClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: SupabaseMessageError }>;
};
type ProfileStoreClient = {
  from: (table: string) => {
    update: (payload: {
      first_name: string | null;
      last_name: string | null;
    }) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: SupabaseMessageError }>;
    };
  };
};

function normalizeNotificationPrefs(
  input?: Partial<Record<NotificationCategory, Partial<CategoryPrefs>>> | null,
): NotificationPrefs {
  return {
    schedule: {
      in_app: input?.schedule?.in_app ?? DEFAULT_NOTIFICATION_PREFS.schedule.in_app,
      email: input?.schedule?.email ?? DEFAULT_NOTIFICATION_PREFS.schedule.email,
    },
    shift_requests: {
      in_app:
        input?.shift_requests?.in_app ??
        DEFAULT_NOTIFICATION_PREFS.shift_requests.in_app,
      email:
        input?.shift_requests?.email ??
        DEFAULT_NOTIFICATION_PREFS.shift_requests.email,
    },
    system: {
      in_app: input?.system?.in_app ?? DEFAULT_NOTIFICATION_PREFS.system.in_app,
      email: input?.system?.email ?? DEFAULT_NOTIFICATION_PREFS.system.email,
    },
  };
}

export default function ProfileScreen() {
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [notificationPrefsError, setNotificationPrefsError] = useState<
    string | null
  >(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingNotificationPrefs, setIsSavingNotificationPrefs] =
    useState(false);
  const [sessionScopeLoading, setSessionScopeLoading] = useState<
    "others" | "global" | null
  >(null);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<
    string | null
  >(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(
    DEFAULT_NOTIFICATION_PREFS,
  );
  const [savedNotificationPrefs, setSavedNotificationPrefs] =
    useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [notificationPrefsLoaded, setNotificationPrefsLoaded] = useState(false);
  const pushRegistration = usePushRegistration(
    accessToken,
    bootstrapQuery.data?.currentOrg.id,
    { autoRegister: false },
  );
  const summary = bootstrapQuery.data
    ? {
        userId: bootstrapQuery.data.user.id,
        name:
          `${bootstrapQuery.data.user.firstName ?? ""} ${bootstrapQuery.data.user.lastName ?? ""}`.trim() ||
          bootstrapQuery.data.user.email ||
          "DubGrid user",
        firstName: bootstrapQuery.data.user.firstName ?? "",
        lastName: bootstrapQuery.data.user.lastName ?? "",
        email: bootstrapQuery.data.user.email ?? "",
        org: bootstrapQuery.data.currentOrg.name,
        orgSlug: bootstrapQuery.data.currentOrg.slug,
        role: bootstrapQuery.data.effectiveRole,
      }
    : null;
  const contentState = getMobileQueryContentState({
    hasData: Boolean(summary),
    isLoading: bootstrapQuery.isLoading,
    error: bootstrapQuery.error,
  });
  const hasNotificationPrefChanges = useMemo(
    () =>
      JSON.stringify(notificationPrefs) !== JSON.stringify(savedNotificationPrefs),
    [notificationPrefs, savedNotificationPrefs],
  );

  useEffect(() => {
    if (!summary) {
      return;
    }

    setEditFirstName(summary.firstName);
    setEditLastName(summary.lastName);
    setEditEmail(summary.email);
  }, [summary]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationPrefs() {
      if (!summary) {
        return;
      }

      const supabase = getSupabaseClient() as unknown as NotificationPrefsClient;

      if (typeof supabase.from !== "function") {
        if (!cancelled) {
          setNotificationPrefsLoaded(true);
        }
        return;
      }

      const result = await supabase
        .from("notification_preferences")
        .select("prefs")
        .eq("user_id", summary.userId)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (result.error) {
        setNotificationPrefsError(result.error.message);
        setNotificationPrefsLoaded(true);
        return;
      }

      const nextPrefs = normalizeNotificationPrefs(result.data?.prefs ?? null);
      setNotificationPrefs(nextPrefs);
      setSavedNotificationPrefs(nextPrefs);
      setNotificationPrefsLoaded(true);
    }

    void loadNotificationPrefs();

    return () => {
      cancelled = true;
    };
  }, [summary]);

  async function handleSwitchWorkspace(input: {
    id: string;
    slug: string | null;
    isCurrent: boolean;
  }) {
    if (input.isCurrent || switchingWorkspaceId) {
      return;
    }

    setSwitchingWorkspaceId(input.id);
    setWorkspaceError(null);

    try {
      const supabase = getSupabaseClient();
      const workspaceClient = supabase as unknown as WorkspaceSwitchClient;
      const switchResult = await workspaceClient.rpc("switch_org", {
        target_org_id: input.id,
      });

      if (switchResult.error) {
        setWorkspaceError(switchResult.error.message);
        return;
      }

      const refreshResult = await supabase.auth.refreshSession();
      if (refreshResult.error || !refreshResult.data.session) {
        setWorkspaceError(
          refreshResult.error?.message ??
            "We couldn't refresh your session after switching workspaces.",
        );
        return;
      }

      await saveLastWorkspaceSlug(input.slug);
      await queryClient.invalidateQueries({ queryKey: ["mobile"] });
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "We couldn't switch workspaces right now.",
      );
    } finally {
      setSwitchingWorkspaceId(null);
    }
  }

  async function handleLogout() {
    setIsSigningOut(true);
    setLogoutError(null);

    try {
      const storedPushDevice = await loadStoredPushDevice();
      if (accessToken && storedPushDevice) {
        try {
          await registerPushToken(accessToken, {
            ...storedPushDevice,
            disabled: true,
          });
        } catch {
          // Keep logout resilient even if token cleanup fails.
        }
      }

      const { error } = await getSupabaseClient().auth.signOut({
        scope: "local",
      });
      if (error) {
        setLogoutError(error.message);
        return;
      }

      await handleExpiredMobileSession({ skipSignOut: true });
    } catch {
      setLogoutError("We couldn't sign you out right now. Try again in a moment.");
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleSaveAccount() {
    if (!summary || isSavingAccount) {
      return;
    }

    setIsSavingAccount(true);
    setAccountError(null);

    const supabase = getSupabaseClient();
    const nextFirstName = editFirstName.trim();
    const nextLastName = editLastName.trim();
    const nextEmail = editEmail.trim().toLowerCase();

    try {
      const profileStore = supabase as unknown as ProfileStoreClient;
      const profileResult = await profileStore
        .from("profiles")
        .update({
          first_name: nextFirstName || null,
          last_name: nextLastName || null,
        })
        .eq("id", summary.userId);

      if (profileResult.error) {
        setAccountError(profileResult.error.message);
        return;
      }

      const shouldUpdateAuth =
        nextEmail !== summary.email ||
        nextFirstName !== summary.firstName ||
        nextLastName !== summary.lastName;

      if (shouldUpdateAuth) {
        const authUpdate = await supabase.auth.updateUser({
          ...(nextEmail !== summary.email ? { email: nextEmail } : {}),
          data: {
            first_name: nextFirstName || null,
            last_name: nextLastName || null,
          },
        });

        if (authUpdate.error) {
          setAccountError(authUpdate.error.message);
          return;
        }
      }

      setIsEditingAccount(false);
      await queryClient.invalidateQueries({ queryKey: ["mobile"] });
      await bootstrapQuery.refetch();
    } catch (error) {
      setAccountError(
        error instanceof Error
          ? error.message
          : "We couldn't save your account details right now.",
      );
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function handleSavePassword() {
    if (isSavingPassword) {
      return;
    }

    setPasswordError(null);
    if (newPassword.length < 10) {
      setPasswordError("Password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const result = await getSupabaseClient().auth.updateUser({
        password: newPassword,
      });
      if (result.error) {
        setPasswordError(result.error.message);
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "We couldn't update your password right now.",
      );
    } finally {
      setIsSavingPassword(false);
    }
  }

  function toggleNotificationPref(
    category: NotificationCategory,
    channel: keyof CategoryPrefs,
  ) {
    setNotificationPrefs((current) => ({
      ...current,
      [category]: {
        ...current[category],
        [channel]: !current[category][channel],
      },
    }));
  }

  async function handleSaveNotificationPrefs() {
    if (!summary || isSavingNotificationPrefs) {
      return;
    }

    setIsSavingNotificationPrefs(true);
    setNotificationPrefsError(null);

    try {
      const notificationPrefsClient =
        getSupabaseClient() as unknown as NotificationPrefsClient;
      if (typeof notificationPrefsClient.from !== "function") {
        setNotificationPrefsError(
          "Notification preferences are unavailable right now.",
        );
        return;
      }

      const result = await notificationPrefsClient
        .from("notification_preferences")
        .upsert(
          {
            user_id: summary.userId,
            prefs: notificationPrefs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      if (result.error) {
        setNotificationPrefsError(result.error.message);
        return;
      }

      setSavedNotificationPrefs(notificationPrefs);
    } catch (error) {
      setNotificationPrefsError(
        error instanceof Error
          ? error.message
          : "We couldn't save your notification preferences.",
      );
    } finally {
      setIsSavingNotificationPrefs(false);
    }
  }

  async function handleSessionAction(scope: "others" | "global") {
    if (sessionScopeLoading) {
      return;
    }

    setSessionScopeLoading(scope);
    setLogoutError(null);

    try {
      const result = await getSupabaseClient().auth.signOut({ scope });
      if (result.error) {
        setLogoutError(result.error.message);
        return;
      }

      if (scope === "global") {
        await handleExpiredMobileSession({ skipSignOut: true });
      }
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "We couldn't update your sessions right now.",
      );
    } finally {
      setSessionScopeLoading(null);
    }
  }

  return (
    <Screen
      title="Profile"
      subtitle="Profile"
      refreshing={
        bootstrapQuery.isFetching ||
        pushRegistration.isRegistering ||
        isSavingNotificationPrefs
      }
      onRefresh={() => {
        void Promise.all([
          bootstrapQuery.refetch(),
          pushRegistration.refreshPushRegistration(),
        ]);
      }}
    >
      {contentState.kind === "loading" ? (
        <QueryStateCard
          title="Loading profile"
          body="Restoring your account summary and organization context."
        />
      ) : contentState.kind === "error" ? (
        <>
          <QueryStateCard
            title="Could not load profile"
            body={contentState.message}
            actionLabel="Try Again"
            onAction={() => {
              void bootstrapQuery.refetch();
            }}
          />
          {logoutError ? (
            <QueryStateCard
              title="Could not sign out"
              body={getQueryErrorMessage(logoutError, logoutError)}
            />
          ) : null}
          {accessToken ? (
            <Button
              disabled={isSigningOut}
              label={isSigningOut ? "Signing Out..." : "Force Sign Out"}
              onPress={() => {
                void handleLogout();
              }}
              tone="danger"
            />
          ) : null}
        </>
      ) : contentState.kind === "empty" ? (
        <Card
          title="Profile unavailable"
          body="We couldn't build your account summary from the current mobile session."
        />
      ) : (
        (() => {
          const readySummary = summary!;
          const memberships = bootstrapQuery.data?.memberships ?? [];

          return (
            <>
              <Card
                title={readySummary.name}
                body={`${readySummary.email || "No email on file"}\nRole: ${readySummary.role}\nWorkspace: ${readySummary.org}`}
                detail={
                  <Text style={styles.profileMeta}>
                    {readySummary.orgSlug
                      ? `${readySummary.orgSlug} workspace saved on this device`
                      : "Saved mobile sign-in active on this device"}
                  </Text>
                }
              />

              {accountError ? (
                <QueryStateCard
                  title="Could not save account details"
                  body={accountError}
                />
              ) : null}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.panel}>
                  {isEditingAccount ? (
                    <>
                      <TextInput
                        placeholder="First name"
                        placeholderTextColor={mobileColors.textSubtle}
                        style={styles.input}
                        value={editFirstName}
                        onChangeText={setEditFirstName}
                      />
                      <TextInput
                        placeholder="Last name"
                        placeholderTextColor={mobileColors.textSubtle}
                        style={styles.input}
                        value={editLastName}
                        onChangeText={setEditLastName}
                      />
                      <TextInput
                        autoCapitalize="none"
                        keyboardType="email-address"
                        placeholder="Email"
                        placeholderTextColor={mobileColors.textSubtle}
                        style={styles.input}
                        value={editEmail}
                        onChangeText={setEditEmail}
                      />
                      <View style={styles.actionsRow}>
                        <Button
                          compact
                          disabled={isSavingAccount}
                          label={isSavingAccount ? "Saving..." : "Save"}
                          onPress={() => {
                            void handleSaveAccount();
                          }}
                        />
                        <Button
                          compact
                          disabled={isSavingAccount}
                          label="Cancel"
                          onPress={() => {
                            setIsEditingAccount(false);
                            setEditFirstName(readySummary.firstName);
                            setEditLastName(readySummary.lastName);
                            setEditEmail(readySummary.email);
                          }}
                          tone="neutral"
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <PreferenceRow
                        label="First name"
                        value={readySummary.firstName || "Not set"}
                      />
                      <PreferenceRow
                        label="Last name"
                        value={readySummary.lastName || "Not set"}
                      />
                      <PreferenceRow
                        label="Email"
                        value={readySummary.email || "No email on file"}
                      />
                      <Button
                        compact
                        label="Edit account details"
                        onPress={() => {
                          setIsEditingAccount(true);
                        }}
                        tone="secondary"
                      />
                    </>
                  )}
                </View>
              </View>

              {passwordError ? (
                <QueryStateCard
                  title="Could not update password"
                  body={passwordError}
                />
              ) : null}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Security</Text>
                <View style={styles.panel}>
                  <TextInput
                    placeholder="New password"
                    placeholderTextColor={mobileColors.textSubtle}
                    secureTextEntry
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                  <TextInput
                    placeholder="Confirm password"
                    placeholderTextColor={mobileColors.textSubtle}
                    secureTextEntry
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                  <View style={styles.actionsRow}>
                    <Button
                      compact
                      disabled={isSavingPassword}
                      label={isSavingPassword ? "Updating..." : "Update password"}
                      onPress={() => {
                        void handleSavePassword();
                      }}
                    />
                    <Button
                      compact
                      disabled={sessionScopeLoading != null}
                      label={
                        sessionScopeLoading === "others"
                          ? "Updating..."
                          : "Sign out other sessions"
                      }
                      onPress={() => {
                        void handleSessionAction("others");
                      }}
                      tone="secondary"
                    />
                    <Button
                      compact
                      disabled={sessionScopeLoading != null}
                      label={
                        sessionScopeLoading === "global"
                          ? "Updating..."
                          : "Sign out all devices"
                      }
                      onPress={() => {
                        void handleSessionAction("global");
                      }}
                      tone="danger"
                    />
                  </View>
                  <Text style={styles.supportingText}>
                    MFA setup and account deletion still live on the web app.
                  </Text>
                </View>
              </View>

              <Card
                title="Mobile notifications"
                body={
                  pushRegistration.permissionState === "granted"
                    ? "Push alerts are enabled for this workspace."
                    : pushRegistration.permissionState === "denied"
                      ? "Push alerts are disabled in system permissions."
                      : pushRegistration.permissionState === "unsupported"
                        ? "Push alerts are not available on this platform."
                        : "Push permission has not been granted yet."
                }
                detail={
                  pushRegistration.isSupported ? (
                    <View style={styles.actionsRow}>
                      <Button
                        compact
                        disabled={pushRegistration.isRegistering}
                        label={
                          pushRegistration.isRegistering
                            ? "Updating..."
                            : pushRegistration.permissionState === "granted"
                              ? "Refresh"
                              : "Enable"
                        }
                        onPress={() => {
                          void pushRegistration.enablePush();
                        }}
                      />
                      <Button
                        compact
                        disabled={
                          pushRegistration.isRegistering ||
                          pushRegistration.permissionState !== "granted"
                        }
                        label="Disable"
                        onPress={() => {
                          void pushRegistration.disablePush();
                        }}
                        tone="neutral"
                      />
                    </View>
                  ) : null
                }
              />

              {notificationPrefsError ? (
                <QueryStateCard
                  title="Could not save notification preferences"
                  body={notificationPrefsError}
                />
              ) : null}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Alert preferences</Text>
                <View style={styles.panel}>
                  {!notificationPrefsLoaded ? (
                    <Text style={styles.supportingText}>
                      Loading notification preferences...
                    </Text>
                  ) : (
                    <>
                      {(
                        Object.keys(
                          NOTIFICATION_CATEGORY_COPY,
                        ) as NotificationCategory[]
                      ).map((category) => (
                        <View key={category} style={styles.preferenceCard}>
                          <View style={styles.preferenceCopy}>
                            <Text style={styles.preferenceTitle}>
                              {NOTIFICATION_CATEGORY_COPY[category].label}
                            </Text>
                            <Text style={styles.preferenceBody}>
                              {NOTIFICATION_CATEGORY_COPY[category].description}
                            </Text>
                          </View>
                          <View style={styles.preferenceActions}>
                            <ToggleChip
                              active={notificationPrefs[category].in_app}
                              label={`In-app ${notificationPrefs[category].in_app ? "on" : "off"}`}
                              onPress={() =>
                                toggleNotificationPref(category, "in_app")
                              }
                            />
                            <ToggleChip
                              active={notificationPrefs[category].email}
                              label={`Email ${notificationPrefs[category].email ? "on" : "off"}`}
                              onPress={() =>
                                toggleNotificationPref(category, "email")
                              }
                            />
                          </View>
                        </View>
                      ))}
                      <Button
                        compact
                        disabled={
                          isSavingNotificationPrefs || !hasNotificationPrefChanges
                        }
                        label={
                          isSavingNotificationPrefs ? "Saving..." : "Save preferences"
                        }
                        onPress={() => {
                          void handleSaveNotificationPrefs();
                        }}
                      />
                    </>
                  )}
                </View>
              </View>

              {workspaceError ? (
                <QueryStateCard
                  title="Could not switch workspace"
                  body={workspaceError}
                />
              ) : null}
              {pushRegistration.error ? (
                <QueryStateCard
                  title="Could not update notifications"
                  body={pushRegistration.error}
                />
              ) : null}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Workspaces</Text>
                <View style={styles.workspaceList}>
                  {memberships.map((membership) => (
                    <View
                      key={membership.id}
                      style={[
                        styles.workspaceRow,
                        membership.isCurrent && styles.workspaceRowCurrent,
                      ]}
                    >
                      <View style={styles.workspaceSummary}>
                        <Text style={styles.workspaceName}>{membership.name}</Text>
                        <Text style={styles.workspaceMeta}>
                          {membership.slug ?? "workspace"} •{" "}
                          {membership.orgRole ?? "user"}
                        </Text>
                      </View>
                      <Button
                        compact
                        disabled={
                          membership.isCurrent ||
                          switchingWorkspaceId === membership.id
                        }
                        label={
                          membership.isCurrent
                            ? "Current"
                            : switchingWorkspaceId === membership.id
                              ? "Switching..."
                              : "Switch"
                        }
                        onPress={() => {
                          void handleSwitchWorkspace(membership);
                        }}
                        tone={membership.isCurrent ? "neutral" : "secondary"}
                      />
                    </View>
                  ))}
                </View>
              </View>
              {logoutError ? (
                <QueryStateCard
                  title="Could not sign out"
                  body={getQueryErrorMessage(logoutError, logoutError)}
                />
              ) : null}
              <Button
                disabled={isSigningOut}
                label={isSigningOut ? "Signing Out..." : "Sign Out"}
                onPress={() => {
                  void handleLogout();
                }}
                tone="danger"
              />
            </>
          );
        })()
      )}
      {!accessToken ? (
        <Card
          title="Web fallback"
          body="Invite acceptance and advanced security setup continue to live on the web app."
        />
      ) : null}
    </Screen>
  );
}

function PreferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.preferenceRow}>
      <Text style={styles.preferenceLabel}>{label}</Text>
      <Text style={styles.preferenceValue}>{value}</Text>
    </View>
  );
}

function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.toggleChip, active && styles.toggleChipActive]}
    >
      <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profileMeta: {
    color: mobileColors.brand,
    fontWeight: "700",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  panel: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 16,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: mobileColors.textPrimary,
    backgroundColor: mobileColors.surfaceSecondary,
    fontSize: 16,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  supportingText: {
    color: mobileColors.textMuted,
    lineHeight: 20,
  },
  preferenceRow: {
    gap: 4,
  },
  preferenceLabel: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  preferenceValue: {
    color: mobileColors.textSecondary,
    lineHeight: 20,
  },
  preferenceCard: {
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: mobileColors.borderSubtle,
  },
  preferenceCopy: {
    gap: 4,
  },
  preferenceTitle: {
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  preferenceBody: {
    color: mobileColors.textMuted,
    lineHeight: 20,
  },
  preferenceActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  toggleChip: {
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: mobileColors.surfaceSecondary,
  },
  toggleChipActive: {
    borderColor: mobileColors.brand,
    backgroundColor: mobileColors.brandSoft,
  },
  toggleChipText: {
    color: mobileColors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  toggleChipTextActive: {
    color: mobileColors.brand,
  },
  workspaceList: {
    gap: 10,
  },
  workspaceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
  },
  workspaceRowCurrent: {
    backgroundColor: mobileColors.surfaceSecondary,
  },
  workspaceSummary: {
    flex: 1,
    gap: 4,
  },
  workspaceName: {
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  workspaceMeta: {
    color: mobileColors.textMuted,
  },
});
