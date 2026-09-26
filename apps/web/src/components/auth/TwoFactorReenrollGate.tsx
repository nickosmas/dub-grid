"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { useAuth } from "@/components/AuthProvider";
import { isPublicRoute } from "@/components/onboarding/public-routes";
import { MFASetup } from "@/components/profile/MFASetup";
import { fetchMfaReenrollStatus } from "@/features/account/client";
import { usePermissions } from "@/hooks";
import { useLogout } from "@/hooks/useLogout";
import { queryKeys } from "@/lib/query-keys";

/**
 * After DubGrid support resets someone's two-factor, holds every app route on
 * enrollment until they set up an authenticator again. A recovery step, not an
 * access boundary: their password already admitted them.
 */
export function TwoFactorReenrollGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const perms = usePermissions();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { signOut } = useLogout();
  const applies =
    Boolean(user) &&
    !isLoading &&
    !perms.isLoading &&
    !perms.isGridmaster &&
    !perms.isImpersonating &&
    !isPublicRoute(pathname);
  const key = queryKeys.account.mfaReenroll(user?.id ?? "anon");
  const status = useQuery({
    queryKey: key,
    queryFn: fetchMfaReenrollStatus,
    enabled: applies,
    staleTime: 60_000,
  });

  if (!applies || !status.data?.reenrollRequired) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-start justify-center bg-[var(--dg-color-bg)] px-4 py-16">
      <div className="flex w-full max-w-[520px] flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="dg-type-page-title">Set up two-factor again</h1>
          <p className="text-[14px] leading-relaxed text-[var(--dg-color-text-secondary)]">
            DubGrid support reset two-factor sign-in on your account. Set up an authenticator app to
            continue.
          </p>
        </div>
        <div className="dg-card">
          <div className="dg-card-body">
            <MFASetup
              mfaEnabled={false}
              onStatusChange={(enabled) => {
                if (enabled) void queryClient.invalidateQueries({ queryKey: key });
              }}
            />
          </div>
        </div>
        <Button className="dg-btn dg-btn-ghost self-start" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
