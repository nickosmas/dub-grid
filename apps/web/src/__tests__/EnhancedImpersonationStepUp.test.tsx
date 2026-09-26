import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EnhancedImpersonation from "@/components/gridmaster/EnhancedImpersonation";
import type { Organization, OrganizationUser } from "@/types";

const stepUpRun = vi.fn();
const requireCredentialAssurance = vi.fn();
const startGridmasterImpersonation = vi.fn();
const endGridmasterImpersonation = vi.fn();
const fetchOrganizationUsers = vi.fn();
const setImpersonationCookie = vi.fn();
const clearImpersonationCookie = vi.fn();
const markAuthTransition = vi.fn();
const locationReplace = vi.fn();

vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (...args: unknown[]) => requireCredentialAssurance(...args),
}));
vi.mock("@/features/gridmaster/client", () => ({
  startGridmasterImpersonation: (...args: unknown[]) => startGridmasterImpersonation(...args),
  endGridmasterImpersonation: (...args: unknown[]) => endGridmasterImpersonation(...args),
}));
vi.mock("@/features/organization/client", () => ({
  fetchOrganizationUsers: (...args: unknown[]) => fetchOrganizationUsers(...args),
}));
vi.mock("@/lib/impersonation", () => ({
  setImpersonationCookie: (...args: unknown[]) => setImpersonationCookie(...args),
  clearImpersonationCookie: (...args: unknown[]) => clearImpersonationCookie(...args),
}));
vi.mock("@/lib/auth-transition", () => ({
  markAuthTransition: (...args: unknown[]) => markAuthTransition(...args),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";
const JUSTIFICATION = "Investigating a reported schedule issue";

const organizations: Organization[] = [
  { id: ORG_ID, name: "Calm Haven", slug: "calm-haven" } as Organization,
];

const target = {
  id: TARGET_ID,
  email: "staff@example.com",
  orgRole: "user",
  platformRole: "none",
} as unknown as OrganizationUser;

const originalLocation = window.location;

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EnhancedImpersonation organizations={organizations} />
    </QueryClientProvider>,
  );
}

async function requestStart() {
  renderView();
  fireEvent.click(screen.getByRole("button", { name: /Calm Haven/ }));
  fireEvent.click(await screen.findByRole("button", { name: /staff@example\.com/ }));
  fireEvent.change(screen.getByPlaceholderText(/Why are you impersonating this user/), {
    target: { value: JUSTIFICATION },
  });
  fireEvent.click(screen.getByRole("button", { name: "Impersonate staff@example.com" }));
  fireEvent.click(await screen.findByRole("button", { name: "Start impersonation" }));
}

describe("Starting an impersonation through step-up (41d7, F-75)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, replace: locationReplace },
    });
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("fresh-token");
      return true;
    });
    requireCredentialAssurance.mockResolvedValue({ success: true });
    fetchOrganizationUsers.mockResolvedValue([target]);
    startGridmasterImpersonation.mockResolvedValue({
      sessionId: "session-1",
      expiresAt: "2026-09-26T12:30:00.000Z",
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("starts with the assured token and sets the impersonation cookie", async () => {
    await requestStart();

    await waitFor(() => expect(setImpersonationCookie).toHaveBeenCalled());
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(startGridmasterImpersonation).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUserId: TARGET_ID,
        targetOrgId: ORG_ID,
        justification: JUSTIFICATION,
      }),
      "fresh-token",
    );
    expect(setImpersonationCookie).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1", targetUserId: TARGET_ID }),
    );
    expect(locationReplace).toHaveBeenCalledWith("/schedule");
  });

  it("starts nothing and closes the confirmation when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValue(false);

    await requestStart();

    await waitFor(() => expect(stepUpRun).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Start impersonation" })).toBeNull(),
    );
    expect(startGridmasterImpersonation).not.toHaveBeenCalled();
    expect(setImpersonationCookie).not.toHaveBeenCalled();
    expect(markAuthTransition).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
  });
});
