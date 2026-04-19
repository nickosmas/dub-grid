import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
import {
  mobileColors,
  mobileRadii,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { usePushRegistration } from "../../notifications/hooks/usePushRegistration";

export default function ProfileScreen() {
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<
    string | null
  >(null);
  const pushRegistration = usePushRegistration(
    accessToken,
    bootstrapQuery.data?.currentOrg.id,
  );
  const summary = bootstrapQuery.data
    ? {
        name:
          `${bootstrapQuery.data.user.firstName ?? ""} ${bootstrapQuery.data.user.lastName ?? ""}`.trim() ||
          bootstrapQuery.data.user.email ||
          "DubGrid user",
        email: bootstrapQuery.data.user.email ?? "No email on file",
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
      const switchResult = await (supabase as typeof supabase & {
        rpc: (
          fn: string,
          args?: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
      }).rpc("switch_org", {
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

  return (
    <Screen
      title="Profile"
      subtitle="Profile"
      refreshing={bootstrapQuery.isFetching || pushRegistration.isRegistering}
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
                body={`${readySummary.email}\nRole: ${readySummary.role}\nWorkspace: ${readySummary.org}`}
                detail={
                  <Text style={styles.profileMeta}>
                    {readySummary.orgSlug
                      ? `${readySummary.orgSlug} workspace saved on this device`
                      : "Saved mobile sign-in active on this device"}
                  </Text>
                }
              />
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
          body="Invite acceptance, MFA enrollment, and password reset continue to live on the web app for v1."
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileMeta: {
    color: mobileColors.brand,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
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
