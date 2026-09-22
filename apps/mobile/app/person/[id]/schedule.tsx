import Screen from "../../../src/features/people/screens/AddToScheduleScreen";
import { ProtectedRoute } from "../../../src/features/auth/components/ProtectedRoute";

export default function AddToScheduleScreenRoute() {
  return (
    <ProtectedRoute>
      <Screen />
    </ProtectedRoute>
  );
}
