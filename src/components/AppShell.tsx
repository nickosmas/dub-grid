"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import { useOrganizationData } from "@/hooks";

const APP_ROUTES = ["/schedule", "/staff", "/settings"];

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
  const showHeader = isAppRoute(pathname);

  return (
    <>
      {showHeader && <AppHeader />}
      {children}
    </>
  );
}
