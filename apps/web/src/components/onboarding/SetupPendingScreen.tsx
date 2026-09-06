"use client";

import { useEffect } from "react";
import { Button } from "@/components/Button";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { useLogout } from "@/hooks";

const RECHECK_INTERVAL_MS = 30_000;

/**
 * Shown to authenticated members who can't advance org config - regular users
 * and admins without any manage-* permission - while the organization is not
 * open to them yet: its configuration is incomplete, or no admin has finished
 * their own onboarding. Blocks the app until that changes.
 *
 * Shares the gate surface with /billing-required, the other screen a member
 * can be held on, so being held reads the same either way.
 */
export default function SetupPendingScreen() {
  const { signOut } = useLogout();

  // A reload is what re-decides this, since the answer comes from the
  // organization bootstrap the whole tree is built on.
  useEffect(() => {
    const interval = setInterval(() => window.location.reload(), RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <PageShell>
      <Card>
        <div className="dg-auth-logo-block dg-auth-logo-block--spacious">
          <DubGridLogo size={72} />
          <DubGridWordmark />
        </div>

        <AuthStateCard
          heading="Setup in progress"
          message="Your administrator is still setting up this organization. You'll be able to get in as soon as they finish."
        >
          <div className="dg-auth-gate-actions">
            <Button
              className="dg-btn dg-btn-secondary dg-btn-lg dg-auth-state-primary"
              onClick={() => signOut()}
              type="button"
            >
              Sign out
            </Button>
            <Button
              className="dg-btn dg-btn-primary dg-btn-lg dg-auth-state-primary"
              onClick={() => window.location.reload()}
              type="button"
            >
              Check again
            </Button>
          </div>
        </AuthStateCard>
      </Card>
    </PageShell>
  );
}
