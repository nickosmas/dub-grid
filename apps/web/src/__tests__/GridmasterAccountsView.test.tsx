import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import GridmasterAccountsView from "@/components/gridmaster/GridmasterAccountsView";
import type { GridmasterAccount, Organization } from "@/types";

const mockFetchGridmasterAccounts = vi.fn();
const mockForceLogoutGridmasterUser = vi.fn();
const stepUpRun = vi.fn();
const mockSendGridmasterPasswordReset = vi.fn();
const mockPromoteGridmasterAccount = vi.fn();
const mockDemoteGridmasterAccount = vi.fn();
const mockUpdateGridmasterAccountActivation = vi.fn();
const requireCredentialAssurance = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterAccounts: () => mockFetchGridmasterAccounts(),
  promoteGridmasterAccount: (...args: unknown[]) => mockPromoteGridmasterAccount(...args),
  demoteGridmasterAccount: (...args: unknown[]) => mockDemoteGridmasterAccount(...args),
  updateGridmasterAccountActivation: (...args: unknown[]) =>
    mockUpdateGridmasterAccountActivation(...args),
  forceLogoutGridmasterUser: (...args: unknown[]) => mockForceLogoutGridmasterUser(...args),
  sendGridmasterPasswordReset: (...args: unknown[]) => mockSendGridmasterPasswordReset(...args),
}));
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (...args: unknown[]) => requireCredentialAssurance(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const organizations: Organization[] = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Arden Wood",
    slug: "arden-wood",
  } as Organization,
];

const accounts: GridmasterAccount[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "current-gm@example.com",
    firstName: "Current",
    lastName: "Gridmaster",
    createdAt: "2026-05-01T15:00:00.000Z",
    lastSignInAt: null,
    deactivatedAt: null,
    deactivatedBy: null,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "other-gm@example.com",
    firstName: "Other",
    lastName: "Gridmaster",
    createdAt: "2026-05-01T15:00:00.000Z",
    lastSignInAt: null,
    deactivatedAt: null,
    deactivatedBy: null,
  },
];

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GridmasterAccountsView
        organizations={organizations}
        currentUserId="11111111-1111-4111-8111-111111111111"
      />
    </QueryClientProvider>,
  );
}

describe("GridmasterAccountsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("fresh-token");
      return true;
    });
    requireCredentialAssurance.mockResolvedValue({ success: true });
    mockForceLogoutGridmasterUser.mockResolvedValue({ success: true });
    mockSendGridmasterPasswordReset.mockResolvedValue({ success: true });
    mockPromoteGridmasterAccount.mockResolvedValue({ success: true, userId: "new-gm" });
    mockDemoteGridmasterAccount.mockResolvedValue({ success: true });
    mockUpdateGridmasterAccountActivation.mockResolvedValue({ success: true });
  });

  it("renders gridmaster-only management without impersonation controls", async () => {
    mockFetchGridmasterAccounts.mockResolvedValueOnce({ accounts });

    renderView();

    expect(await screen.findByRole("heading", { name: "Gridmaster Accounts" })).toBeInTheDocument();
    expect(screen.getByText("current-gm@example.com")).toBeInTheDocument();
    expect(screen.getByText("other-gm@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /impersonate/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Demote" })[0]).toBeDisabled();
      expect(screen.getAllByRole("button", { name: "Deactivate" })[0]).toBeDisabled();
    });
  });

  it("requires fresh assurance before force logout", async () => {
    mockFetchGridmasterAccounts.mockResolvedValueOnce({ accounts });
    renderView();

    const buttons = await screen.findAllByRole("button", { name: "Force Logout" });
    fireEvent.click(buttons[1]);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Force logout" })).getByRole("button", {
        name: "Force logout",
      }),
    );

    await waitFor(() => expect(mockForceLogoutGridmasterUser).toHaveBeenCalledOnce());
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(mockForceLogoutGridmasterUser).toHaveBeenCalledWith(accounts[1].id, "fresh-token");
  });

  it("requires fresh assurance before sending a password reset", async () => {
    mockFetchGridmasterAccounts.mockResolvedValueOnce({ accounts });
    renderView();

    const buttons = await screen.findAllByRole("button", { name: "Reset Password" });
    fireEvent.click(buttons[buttons.length - 1]);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Send Password Reset" })).getByRole("button", {
        name: "Send reset email",
      }),
    );

    await waitFor(() => expect(mockSendGridmasterPasswordReset).toHaveBeenCalledOnce());
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(requireCredentialAssurance.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendGridmasterPasswordReset.mock.invocationCallOrder[0],
    );
    expect(mockSendGridmasterPasswordReset).toHaveBeenCalledWith(
      expect.stringContaining("@example.com"),
      "fresh-token",
    );
  });

  // Promotion grants platform authority (41b3).
  it("requires fresh assurance before promoting a Gridmaster", async () => {
    mockFetchGridmasterAccounts.mockResolvedValueOnce({ accounts });
    renderView();

    fireEvent.change(await screen.findByLabelText("Promote by email"), {
      target: { value: "new-gm@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Promote" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Promote Gridmaster" })).getByRole("button", {
        name: "Promote",
      }),
    );

    await waitFor(() => expect(mockPromoteGridmasterAccount).toHaveBeenCalledOnce());
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(mockPromoteGridmasterAccount).toHaveBeenCalledWith("new-gm@example.com", "fresh-token");
  });

  it("requires fresh assurance before demoting a Gridmaster", async () => {
    mockFetchGridmasterAccounts.mockResolvedValueOnce({ accounts });
    renderView();

    const buttons = await screen.findAllByRole("button", { name: "Demote" });
    await waitFor(() => expect(buttons[1]).toBeEnabled());
    fireEvent.click(buttons[1]);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Demote Gridmaster" })).getByRole("button", {
        name: "Demote",
      }),
    );

    await waitFor(() => expect(mockDemoteGridmasterAccount).toHaveBeenCalledOnce());
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(mockDemoteGridmasterAccount).toHaveBeenCalledWith(
      { userId: accounts[1].id, orgId: organizations[0].id, orgRole: expect.any(String) },
      "fresh-token",
    );
  });

  it("requires fresh assurance before deactivating a Gridmaster", async () => {
    mockFetchGridmasterAccounts.mockResolvedValueOnce({ accounts });
    renderView();

    const buttons = await screen.findAllByRole("button", { name: "Deactivate" });
    await waitFor(() => expect(buttons[1]).toBeEnabled());
    fireEvent.click(buttons[1]);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Deactivate Gridmaster" })).getByRole("button", {
        name: "Deactivate",
      }),
    );

    await waitFor(() => expect(mockUpdateGridmasterAccountActivation).toHaveBeenCalledOnce());
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(mockUpdateGridmasterAccountActivation).toHaveBeenCalledWith(
      { userId: accounts[1].id, deactivate: true },
      "fresh-token",
    );
  });

  it("keeps the confirmation open and quiet when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValue(false);
    mockFetchGridmasterAccounts.mockResolvedValueOnce({ accounts });
    renderView();

    const buttons = await screen.findAllByRole("button", { name: "Reset Password" });
    fireEvent.click(buttons[buttons.length - 1]);
    const dialog = screen.getByRole("dialog", { name: "Send Password Reset" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send reset email" }));

    await waitFor(() => expect(stepUpRun).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Send reset email" })).toBeEnabled(),
    );
    expect(screen.getByRole("dialog", { name: "Send Password Reset" })).toBeInTheDocument();
    expect(mockSendGridmasterPasswordReset).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
