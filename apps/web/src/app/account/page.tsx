import { ProtectedRoute } from "@/components/RouteGuards";
import { AccountPage } from "@/components/account/AccountPage";

export default function AccountRoute() {
  return (
    <ProtectedRoute>
      <AccountPage />
    </ProtectedRoute>
  );
}
