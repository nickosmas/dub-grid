import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useConfirmLeave, useNavigationGuard } from "@/components/NavigationGuardProvider";
import AppShellProviders from "@/components/AppShellProviders";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/**
 * The real gate renders the onboarding wizard in place of the shell, so what
 * matters is only that whatever it renders sits inside the guard provider.
 */
function WizardEditor() {
  useNavigationGuard("wizard", { isDirty: () => true });
  const confirmLeave = useConfirmLeave();
  return (
    <button type="button" onClick={() => confirmLeave(() => {})}>
      Back
    </button>
  );
}

vi.mock("@/components/onboarding/OnboardingGate", () => ({
  default: () => <WizardEditor />,
}));
vi.mock("@/components/auth/TwoFactorReenrollGate", () => ({
  TwoFactorReenrollGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

describe("AppShellProviders", () => {
  it("puts the onboarding wizard inside the navigation guard", async () => {
    render(<AppShellProviders>page</AppShellProviders>);

    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Discard your changes?")).toBeInTheDocument();
  });
});
