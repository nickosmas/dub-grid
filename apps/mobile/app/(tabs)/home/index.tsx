import { Redirect } from "expo-router";
import { LoadingScreen } from "../../../src/shared/components/LoadingScreen";
import { useSessionState } from "../../../src/shared/providers/AuthSessionProvider";
import { useBootstrap } from "../../../src/features/auth/hooks/useBootstrap";
import { isAdminHomeRole } from "../../../src/features/auth/hooks/useTabsGate";
import { isManagementOnly } from "../../../src/features/auth/hooks/employmentStatus";
import { AdminHomeScreen } from "../../../src/features/dashboard/screens/AdminHomeScreen";
import { HomeScheduleScreen } from "../../../src/features/schedule/screens/ScheduleScreen";

export default function HomeTabScreen() {
  const { accessToken } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);

  if (bootstrapQuery.isLoading) {
    return (
      <LoadingScreen
        title="Loading your organization"
        body="Getting your schedule and mobile tools ready."
      />
    );
  }

  if (isAdminHomeRole(bootstrapQuery.data?.effectiveRole)) {
    return <AdminHomeScreen />;
  }

  // Management-only regular users have no personal schedule and the Home tab
  // is hidden for them (see useTabsGate's canViewHomeTab) — if this route is
  // still reached directly (e.g. the post-login redirect), send them to the
  // team schedule instead of an empty "you're not scheduled" screen.
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  if (
    bootstrapQuery.data?.effectiveRole === "user" &&
    isManagementOnly(linkedEmployee?.focusAreaIds ?? [], linkedEmployee?.departmentIds ?? [])
  ) {
    return <Redirect href="/(tabs)/team" />;
  }

  return <HomeScheduleScreen />;
}
