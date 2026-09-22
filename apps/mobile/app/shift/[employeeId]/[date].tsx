import Screen from "../../../src/features/schedule/screens/ShiftDetailScreen";
import { ProtectedRoute } from "../../../src/features/auth/components/ProtectedRoute";

export default function ShiftDetailScreenRoute() {
  return (
    <ProtectedRoute>
      <Screen />
    </ProtectedRoute>
  );
}
