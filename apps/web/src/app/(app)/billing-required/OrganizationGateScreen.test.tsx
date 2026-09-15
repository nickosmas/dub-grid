import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchOrganizationAccessStatus = vi.fn();
const signOut = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/features/organization/client/api", () => ({
  fetchOrganizationAccessStatus: () => fetchOrganizationAccessStatus(),
}));

vi.mock("@/hooks", () => ({
  useLogout: () => ({ signOut }),
}));

import { isAuthTransitionPending, markAuthTransition } from "@/lib/auth-transition";
import {
  getGateMessage,
  ORGANIZATION_GATE_RECHECK_INTERVAL_MS,
  OrganizationGateScreen,
} from "./OrganizationGateScreen";

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationGateScreen />
    </QueryClientProvider>,
  );
}

describe("OrganizationGateScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    fetchOrganizationAccessStatus.mockResolvedValue({ available: false, state: "trial_pending" });
  });

  it("gives a held-out user the brand, a way to re-check, and a way out", async () => {
    renderScreen();

    expect(screen.getByRole("heading", { name: "Organization unavailable" })).toBeInTheDocument();
    expect(screen.getByText("dubgrid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalled());
  });

  it("checks for restored access within five seconds while the gate is visible", () => {
    expect(ORGANIZATION_GATE_RECHECK_INTERVAL_MS).toBe(5_000);
  });

  it("admits the same user without a hard refresh once the organization opens", async () => {
    fetchOrganizationAccessStatus.mockResolvedValue({ available: true, state: "active" });

    renderScreen();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/schedule"));
  });

  it("stays put while the organization is still closed", async () => {
    renderScreen();

    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });

  it("re-checks on demand", async () => {
    renderScreen();
    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /check again/i }));

    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalledTimes(2));
    expect(replace).not.toHaveBeenCalled();
  });

  it("navigates exactly once when a manual check finds the organization open", async () => {
    fetchOrganizationAccessStatus
      .mockResolvedValueOnce({ available: false, state: "locked" })
      .mockResolvedValueOnce({ available: true, state: "active" });

    renderScreen();
    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /check again/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/schedule");
  });

  it("coalesces reconnect and manual checks into one active request", async () => {
    let resolveCheck: ((value: { available: false; state: "unavailable" }) => void) | undefined;
    fetchOrganizationAccessStatus
      .mockResolvedValueOnce({ available: false, state: "unavailable" })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCheck = resolve;
          }),
      );

    renderScreen();
    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("online")));
    await userEvent.click(screen.getByRole("button", { name: /check again/i }));

    expect(fetchOrganizationAccessStatus).toHaveBeenCalledTimes(2);
    await act(async () => resolveCheck?.({ available: false, state: "unavailable" }));
  });

  it("signs out without leaving the user to find their own way", async () => {
    renderScreen();

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  // Nothing else on this route clears it: the onboarding gate passes straight
  // through, and there is no ProtectedRoute above the page.
  it("ends the sign-in handoff rather than leaving later screens bridging it", async () => {
    markAuthTransition();

    renderScreen();

    await waitFor(() => expect(isAuthTransitionPending()).toBe(false));
  });

  it("does not identify the cause to a held-out User or Admin", async () => {
    fetchOrganizationAccessStatus.mockResolvedValue({ available: false, state: "unavailable" });

    renderScreen();

    expect(await screen.findByText(/currently unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/billing|trial|suspend|archive/i)).not.toBeInTheDocument();
  });
});

describe("getGateMessage", () => {
  it("keeps the setup wording for an unstarted trial and for an unknown state", () => {
    const setupCopy = "Your organization opens up once your administrator finishes setup.";
    expect(getGateMessage("trial_pending")).toBe(setupCopy);
    expect(getGateMessage("unknown")).toBe(setupCopy);
    expect(getGateMessage(undefined)).toBe(setupCopy);
  });

  it("uses neutral wording for a redacted unavailable state", () => {
    const message = getGateMessage("unavailable");
    expect(message).toMatch(/currently unavailable/i);
    expect(message).not.toMatch(/billing|trial|suspend|archive/i);
  });

  it("keeps cause-specific recovery wording for authorized states", () => {
    expect(getGateMessage("locked")).toMatch(/billing/i);
    expect(getGateMessage("suspended")).toMatch(/suspended/i);
    expect(getGateMessage("archived")).toMatch(/no longer available/i);
  });
});
