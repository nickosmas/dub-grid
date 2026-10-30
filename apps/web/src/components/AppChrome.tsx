"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isSignInRoute } from "@/components/onboarding/public-routes";

// Loaded through dynamic() so a sign-in page never downloads the header, the
// gates or the navigation guard. A page that renders the shell still gets its
// chunks preloaded with the server HTML, so nothing waits on them there.
const AppShellProviders = dynamic(() => import("@/components/AppShellProviders"));

/**
 * The sign-in pages share the auth provider and query cache with the app, so
 * signing in can soft-navigate to a dashboard whose data is already primed,
 * but none of the app's chrome.
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isSignInRoute(pathname)) return <>{children}</>;
  return <AppShellProviders>{children}</AppShellProviders>;
}
