import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchOrganizationAccessStatus = vi.fn();
const signOut = vi.fn();
const reload = vi.fn();

vi.mock("@/features/organization/client/api", () => ({
  fetchOrganizationAccessStatus: () => fetchOrganizationAccessStatus(),
}));

vi.mock("@/hooks", () => ({
  useLogout: () => ({ signOut }),
}));

Object.defineProperty(window, "location", {
  value: { reload, origin: "https://acme.dubgrid.com" },
  writable: true,
});

import { isAuthTransitionPending, markAuthTransition } from "@/lib/auth-transition";
import {
  claimAutomaticReload,
  getGateMessage,
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

  it("reloads on its own once the organization opens", async () => {
    fetchOrganizationAccessStatus.mockResolvedValue({ available: true, state: "active" });

    renderScreen();

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("stays put while the organization is still closed", async () => {
    renderScreen();

    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
  });

  it("re-checks on demand", async () => {
    renderScreen();
    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /check again/i }));

    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalledTimes(2));
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads exactly once when a manual check finds the organization open", async () => {
    fetchOrganizationAccessStatus
      .mockResolvedValueOnce({ available: false, state: "locked" })
      .mockResolvedValueOnce({ available: true, state: "active" });

    renderScreen();
    await waitFor(() => expect(fetchOrganizationAccessStatus).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /check again/i }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
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

  it("says what is actually wrong when billing has lapsed", async () => {
    fetchOrganizationAccessStatus.mockResolvedValue({ available: false, state: "locked" });

    renderScreen();

    expect(await screen.findByText(/billing/i)).toBeInTheDocument();
  });
});

describe("getGateMessage", () => {
  it("keeps the setup wording for an unstarted trial and for an unknown state", () => {
    const setupCopy = "Your organization opens up once your administrator finishes setup.";
    expect(getGateMessage("trial_pending")).toBe(setupCopy);
    expect(getGateMessage("unknown")).toBe(setupCopy);
    expect(getGateMessage(undefined)).toBe(setupCopy);
  });

  it("names the real cause for a locked, suspended, or deleted organization", () => {
    expect(getGateMessage("locked")).toMatch(/billing/i);
    expect(getGateMessage("suspended")).toMatch(/suspended/i);
    expect(getGateMessage("archived")).toMatch(/no longer available/i);
  });
});

describe("claimAutomaticReload", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("spends one automatic reload, then holds off until the proxy's gate can catch up", () => {
    const start = 1_000_000;
    expect(claimAutomaticReload(start)).toBe(true);
    // A gate still serving its cached answer bounces the user straight back
    // here; without the cooldown that is an endless reload loop.
    expect(claimAutomaticReload(start + 20_000)).toBe(false);
    expect(claimAutomaticReload(start + 46_000)).toBe(true);
  });
});
