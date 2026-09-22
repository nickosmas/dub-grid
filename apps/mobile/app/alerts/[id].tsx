import Screen from "../../src/features/notifications/screens/NotificationDetailScreen";
import { ProtectedRoute } from "../../src/features/auth/components/ProtectedRoute";

export default function NotificationDetailScreenRoute() {
  return (
    <ProtectedRoute>
      <Screen />
    </ProtectedRoute>
  );
}
