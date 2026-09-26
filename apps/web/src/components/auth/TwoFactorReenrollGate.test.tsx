import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TwoFactorReenrollGate } from "./TwoFactorReenrollGate";

const fetchMfaReenrollStatus = vi.fn();
const signOut = vi.fn();
let pathname = "/dashboard";
let permissions = { isLoading: false, isGridmaster: false, isImpersonating: false };

vi.mock("@/features/account/client", () => ({
  fetchMfaReenrollStatus: () => fetchMfaReenrollStatus(),
}));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isLoading: false }),
}));
vi.mock("@/hooks", () => ({ usePermissions: () => permissions }));
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => ({ signOut }) }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/profile/MFASetup", () => ({
  MFASetup: ({ onStatusChange }: { onStatusChange: (enabled: boolean) => void }) => (
    <button type="button" onClick={() => onStatusChange(true)}>
      Finish enrollment stub
    </button>
  ),
}));

function renderGate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TwoFactorReenrollGate>
        <p>The app</p>
      </TwoFactorReenrollGate>
    </QueryClientProvider>,
  );
}

describe("TwoFactorReenrollGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = "/dashboard";
    permissions = { isLoading: false, isGridmaster: false, isImpersonating: false };
  });

  it("holds the app on enrollment after a reset, and lifts once a factor is verified", async () => {
    fetchMfaReenrollStatus
      .mockResolvedValueOnce({ reenrollRequired: true })
      .mockResolvedValueOnce({ reenrollRequired: false });
    renderGate();

    expect(await screen.findByRole("heading", { name: "Set up two-factor again" })).toBeVisible();
    expect(screen.queryByText("The app")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Finish enrollment stub" }));
    expect(await screen.findByText("The app")).toBeInTheDocument();
    expect(fetchMfaReenrollStatus).toHaveBeenCalledTimes(2);
  });

  it("lets them sign out instead", async () => {
    fetchMfaReenrollStatus.mockResolvedValue({ reenrollRequired: true });
    renderGate();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("shows the app when no reset is pending", async () => {
    fetchMfaReenrollStatus.mockResolvedValue({ reenrollRequired: false });
    renderGate();
    await waitFor(() => expect(fetchMfaReenrollStatus).toHaveBeenCalled());
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it.each([
    ["a public route", () => (pathname = "/login")],
    [
      "a Gridmaster",
      () => (permissions = { isLoading: false, isGridmaster: true, isImpersonating: false }),
    ],
    [
      "an impersonation",
      () => (permissions = { isLoading: false, isGridmaster: false, isImpersonating: true }),
    ],
  ])("never checks on %s", (_name, arrange) => {
    arrange();
    renderGate();
    expect(screen.getByText("The app")).toBeInTheDocument();
    expect(fetchMfaReenrollStatus).not.toHaveBeenCalled();
  });
});
