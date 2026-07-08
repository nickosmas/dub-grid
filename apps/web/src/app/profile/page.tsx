import { ProtectedRoute } from "@/components/RouteGuards";
import { ProfilePage } from "@/components/profile/ProfilePage";

export default function ProfileRoute() {
  return (
    <ProtectedRoute>
      <ProfilePage />
    </ProtectedRoute>
  );
}
