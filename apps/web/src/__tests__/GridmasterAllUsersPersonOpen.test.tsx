import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AllUsersView from "@/components/gridmaster/AllUsersView";
import type { PlatformUser } from "@/types";

const fetchGridmasterUsers = vi.fn();
const searchGridmasterStaff = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterUsers: () => fetchGridmasterUsers(),
  searchGridmasterStaff: (query: string) => searchGridmasterStaff(query),
}));
vi.mock("@/components/gridmaster/person/GridmasterPersonView", () => ({
  default: ({ target, onBack }: { target: unknown; onBack: () => void }) => (
    <div>
      <p>Person view for {JSON.stringify(target)}</p>
      <button type="button" onClick={onBack}>
        Back to all users
      </button>
    </div>
  ),
}));

const USER = "11111111-1111-4111-8111-111111111111";
const STAFF = "44444444-4444-4444-8444-444444444444";

const users = [
  {
    id: USER,
    email: "ada@example.com",
    platformRole: "none",
    orgRole: "user",
    orgId: null,
    orgName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSignInAt: null,
    deactivatedAt: null,
    terminatedAt: null,
  },
] as unknown as PlatformUser[];

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AllUsersView organizations={[]} onNavigateToOrg={vi.fn()} onImpersonate={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("All Users opens the person view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchGridmasterUsers.mockResolvedValue({ users });
    searchGridmasterStaff.mockResolvedValue({
      staff: [
        {
          employeeId: STAFF,
          orgId: "o-1",
          orgName: "Calm Haven",
          name: "Grace Hopper",
          email: "grace@example.com",
          phone: "",
          status: "inactive",
          archivedAt: null,
        },
      ],
    });
  });

  it("opens an account from the list and returns to it", async () => {
    renderView();

    fireEvent.click(await screen.findByText("ada@example.com"));
    expect(screen.getByText(`Person view for {"kind":"user","userId":"${USER}"}`)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to all users" }));
    expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
  });

  it("finds staff without an account and opens one", async () => {
    renderView();

    const input = await screen.findByLabelText("Search staff without an account");
    fireEvent.change(input, { target: { value: "g" } });
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    fireEvent.change(input, { target: { value: " grace " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(searchGridmasterStaff).toHaveBeenCalledWith("grace"));
    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Grace Hopper"));
    expect(
      screen.getByText(`Person view for {"kind":"staff","employeeId":"${STAFF}"}`),
    ).toBeVisible();
  });

  it("says when no staff match", async () => {
    searchGridmasterStaff.mockResolvedValueOnce({ staff: [] });
    renderView();

    fireEvent.change(await screen.findByLabelText("Search staff without an account"), {
      target: { value: "zed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText(/No staff without an account match "zed"/)).toBeInTheDocument();
  });
});
