import Screen from "../../../src/features/people/screens/PersonDetailScreen";
import { ProtectedRoute } from "../../../src/features/auth/components/ProtectedRoute";

export default function PersonDetailScreenRoute() {
  return (
    <ProtectedRoute>
      <Screen />
    </ProtectedRoute>
  );
}
