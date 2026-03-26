"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { useOrganizationData, usePermissions } from "@/hooks";

const APP_ROUTES = ["/dashboard", "/schedule", "/staff", "/settings"];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

function AppHeader() {
  const { org } = useOrganizationData();
  return (
    <div
      className="no-print"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--color-bg)",
        boxShadow: "var(--shadow-raised)",
      }}
    >
      <Header orgName={org?.name} />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isGridmaster, isLoading } = usePermissions();

  // Show the org header on app routes, but not when gridmaster is at /dashboard
  // (the gridmaster portal renders its own header).
  // Skip while permissions are loading to prevent mounting AppHeader (and its
  // useOrganizationData hook) before we know the user's role — gridmaster users
  // have no org and the unnecessary fetches add significant latency.
  const showHeader = !isLoading && isAppRoute(pathname) && !(isGridmaster && pathname === "/dashboard");

  return (
    <>
      <ImpersonationBanner />
      {showHeader && <AppHeader />}
      {children}
    </>
  );
}
