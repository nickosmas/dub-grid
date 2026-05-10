import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GridmasterAccountsView from "@/components/gridmaster/GridmasterAccountsView";
import type { GridmasterAccount, Organization } from "@/types";

const mockFetchGridmasterAccounts = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterAccounts: () => mockFetchGridmasterAccounts(),
  promoteGridmasterAccount: vi.fn(),
  demoteGridmasterAccount: vi.fn(),
  updateGridmasterAccountActivation: vi.fn(),
  forceLogoutGridmasterUser: vi.fn(),
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
});
