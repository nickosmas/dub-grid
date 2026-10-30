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
    <OnboardingGate>
      <TwoFactorReenrollGate>
        <MobileSubNavProvider>
          <TooltipProvider delay={TOOLTIP_DELAY_MS}>
            {/* Wraps the whole shell so it sees every nav link,
              not just the ones inside a given page. */}
            <NavigationGuardProvider>
              <AppShell>{children}</AppShell>
            </NavigationGuardProvider>
          </TooltipProvider>
        </MobileSubNavProvider>
      </TwoFactorReenrollGate>
    </OnboardingGate>
  );
}
