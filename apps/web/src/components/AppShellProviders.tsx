"use client";

import AppShell from "@/components/AppShell";
import { MobileSubNavProvider } from "@/components/MobileSubNavContext";
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";
import { TooltipProvider } from "@/components/ui/hint";
import { TOOLTIP_DELAY_MS } from "@/lib/constants";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import { TwoFactorReenrollGate } from "@/components/auth/TwoFactorReenrollGate";

/** The signed-in app's gates, providers and header, around every page but the sign-in ones. */
export default function AppShellProviders({ children }: { children: React.ReactNode }) {
  return (
    // Outermost, so it sees every nav link rather than the ones inside a given
    // page, and so the onboarding wizard (which the gate renders instead of the
    // shell) can register its editors too.
    <NavigationGuardProvider>
      <OnboardingGate>
        <TwoFactorReenrollGate>
          <MobileSubNavProvider>
            <TooltipProvider delay={TOOLTIP_DELAY_MS}>
              <AppShell>{children}</AppShell>
            </TooltipProvider>
          </MobileSubNavProvider>
        </TwoFactorReenrollGate>
      </OnboardingGate>
    </NavigationGuardProvider>
  );
}
