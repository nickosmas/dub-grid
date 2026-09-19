import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TrialWelcomeModal from "@/components/TrialWelcomeModal";
import { fetchTrialWelcomeState } from "@/features/billing/client";

const mockPermissions = {
  orgId: "org-1",
  isSuperAdmin: true,
  isGridmaster: false,
  isImpersonating: false,
};

const mockTerms = { data: { acceptedCurrentTerms: true } };

const mockOrganizationData = {
  entryGate: { onboardingCompleted: true } as { onboardingCompleted: boolean } | null,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/hooks", () => ({
  usePermissions: () => mockPermissions,
  useTermsAcceptanceStatus: () => mockTerms,
  useOrganizationData: () => mockOrganizationData,
}));

vi.mock("@/features/billing/client", () => ({
  fetchTrialWelcomeState: vi.fn(),
  dismissTrialWelcome: vi.fn(),
}));

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TrialWelcomeModal />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPermissions.orgId = "org-1";
  mockPermissions.isSuperAdmin = true;
  mockPermissions.isGridmaster = false;
  mockPermissions.isImpersonating = false;
  mockTerms.data = { acceptedCurrentTerms: true };
  mockOrganizationData.entryGate = { onboardingCompleted: true };
  vi.mocked(fetchTrialWelcomeState).mockResolvedValue({
    shouldShowWelcome: true,
    trialEndsAt: "2026-10-01T00:00:00.000Z",
  });
});

describe("TrialWelcomeModal", () => {
  it("shows the welcome once onboarding is complete", async () => {
    renderModal();
    expect(await screen.findByText("Your trial has started!")).toBeInTheDocument();
  });

  // The trial clock starts on the super admin's first sign-in, which is the
  // same sign-in that walks them through onboarding. Without this guard the
  // welcome opened on top of the wizard (build plan item 36).
  it("stays closed while onboarding is still in progress", async () => {
    mockOrganizationData.entryGate = { onboardingCompleted: false };

    renderModal();

    await waitFor(() => expect(fetchTrialWelcomeState).not.toHaveBeenCalled());
    expect(screen.queryByText("Your trial has started!")).not.toBeInTheDocument();
  });

  it("stays closed before the entry gate has resolved", async () => {
    mockOrganizationData.entryGate = null;

    renderModal();

    await waitFor(() => expect(fetchTrialWelcomeState).not.toHaveBeenCalled());
    expect(screen.queryByText("Your trial has started!")).not.toBeInTheDocument();
  });
});
