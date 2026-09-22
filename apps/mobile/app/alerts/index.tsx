import Screen from "../../src/features/notifications/screens/NotificationsScreen";
import { ProtectedRoute } from "../../src/features/auth/components/ProtectedRoute";

export default function NotificationsScreenRoute() {
  return (
    <ProtectedRoute>
      <Screen />
    </ProtectedRoute>
  );
}
