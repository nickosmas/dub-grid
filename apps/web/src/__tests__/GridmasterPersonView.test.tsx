import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import GridmasterPersonView from "@/components/gridmaster/person/GridmasterPersonView";
import type { GridmasterPersonTarget } from "@/features/gridmaster/client";
import type { GridmasterPersonRecord } from "@/features/gridmaster/person-record";

const fetchGridmasterPerson = vi.fn();
const forceLogoutGridmasterUser = vi.fn();
const sendGridmasterPasswordReset = vi.fn();
const terminateGridmasterUser = vi.fn();
const reinstateGridmasterUser = vi.fn();
const updateGridmasterUserActivation = vi.fn();
const requireCredentialAssurance = vi.fn();
const stepUpRun = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterPerson: (...args: unknown[]) => fetchGridmasterPerson(...args),
  forceLogoutGridmasterUser: (...args: unknown[]) => forceLogoutGridmasterUser(...args),
  sendGridmasterPasswordReset: (...args: unknown[]) => sendGridmasterPasswordReset(...args),
  terminateGridmasterUser: (...args: unknown[]) => terminateGridmasterUser(...args),
  reinstateGridmasterUser: (...args: unknown[]) => reinstateGridmasterUser(...args),
  updateGridmasterUserActivation: (...args: unknown[]) => updateGridmasterUserActivation(...args),
}));
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (...args: unknown[]) => requireCredentialAssurance(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const USER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const GRIDMASTER = "33333333-3333-4333-8333-333333333333";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FUTURE = "2099-01-01T12:00:00.000Z";

function linkedRecord(overrides: Partial<GridmasterPersonRecord> = {}): GridmasterPersonRecord {
  return {
    account: {
      userId: USER,
      email: "ada@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastSignInAt: "2026-09-25T08:00:00.000Z",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
    },
    profile: {
      firstName: "Ada",
      lastName: "Lovelace",
      platformRole: "none",
      mfaEnabled: true,
      termsVersion: "2026-05",
      termsAcceptedAt: "2026-01-03T00:00:00.000Z",
      scheduledDeletionAt: null,
      deactivationWarnedAt: null,
      deactivatedAt: null,
      deactivatedBy: null,
      terminatedAt: null,
      terminatedBy: null,
      terminatedReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
    termsAcceptances: [
      { version: "2026-05", acceptedAt: "2026-01-03T00:00:00.000Z", userAgent: "Mobile Safari" },
    ],
    cookieConsents: [
      {
        version: "1",
        consent: { essential: true, analytics: false },
        createdAt: "2026-01-03T00:00:00.000Z",
        userAgent: null,
      },
    ],
    liveImpersonation: null,
    loginLock: null,
    organizations: [
      {
        org: { id: ORG, name: "Calm Haven", slug: "calmhaven" },
        membership: {
          id: "m-1",
          orgRole: "admin",
          adminPermissions: null,
          joinedAt: "2026-01-03T00:00:00.000Z",
          scheduleLastViewedAt: null,
          archivedAt: null,
          archivedBy: null,
          departmentIds: [],
          deptAdminIds: [],
          phone: null,
          onboardingCompletedAt: null,
          tooltipToursCompleted: {},
          updatedAt: null,
        },
        employees: [],
        invitations: [],
      },
    ],
    actors: { [ADMIN]: "admin@example.com", [GRIDMASTER]: "gm@dubgrid.com" },
    ...overrides,
  };
}

function renderView(
  record: GridmasterPersonRecord,
  target: GridmasterPersonTarget = { kind: "user", userId: USER },
) {
  fetchGridmasterPerson.mockResolvedValue({ person: record });
  const onBack = vi.fn();
  const onImpersonate = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GridmasterPersonView target={target} onBack={onBack} onImpersonate={onImpersonate} />
    </QueryClientProvider>,
  );
  return { onBack, onImpersonate };
}

describe("GridmasterPersonView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("fresh-token");
      return true;
    });
    requireCredentialAssurance.mockResolvedValue({ success: true });
    forceLogoutGridmasterUser.mockResolvedValue({ success: true });
  });

  it("shows who the person is and every account state badge", async () => {
    renderView(
      linkedRecord({
        profile: {
          ...linkedRecord().profile!,
          deactivatedAt: "2026-09-01T00:00:00.000Z",
          deactivatedBy: ADMIN,
          scheduledDeletionAt: "2026-10-01T00:00:00.000Z",
        },
        loginLock: { locked: true, resetsAt: "2026-09-26T12:15:00.000Z" },
        liveImpersonation: {
          gridmasterId: GRIDMASTER,
          orgId: ORG,
          startedAt: "2026-09-26T10:00:00.000Z",
          expiresAt: FUTURE,
        },
      }),
    );

    expect(await screen.findByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    const states = screen.getByLabelText("Account state");
    expect(within(states).getByText("No platform role")).toBeInTheDocument();
    expect(within(states).getByText(/^Deactivated/)).toBeInTheDocument();
    expect(within(states).getByText(/^Deletion scheduled/)).toBeInTheDocument();
    expect(within(states).getByText(/^Sign-in locked until/)).toBeInTheDocument();
    expect(within(states).getByText("Being impersonated")).toBeInTheDocument();
    expect(screen.getByText(/by admin@example\.com/)).toBeInTheDocument();
  });

  it("shows the sign-in record, profile and consent history", async () => {
    renderView(linkedRecord());

    expect(await screen.findByText("Sign-in email")).toBeInTheDocument();
    expect(screen.getAllByText("ada@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Two-factor")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByText("Accepted terms 2026-05")).toBeInTheDocument();
    expect(screen.getByText("Mobile Safari")).toBeInTheDocument();
    expect(screen.getByText(/Cookies: Essential, analytics off/)).toBeInTheDocument();
  });

  it("reads a staff record with no account without offering account actions", async () => {
    renderView(
      linkedRecord({ account: null, profile: null, termsAcceptances: [], cookieConsents: [] }),
      {
        kind: "staff",
        employeeId: "44444444-4444-4444-8444-444444444444",
      },
    );

    expect(
      await screen.findByText(/has a staff record but has never signed in/),
    ).toBeInTheDocument();
    expect(screen.getByText("No account")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Force logout" })).not.toBeInTheDocument();
    expect(fetchGridmasterPerson).toHaveBeenCalledWith({
      kind: "staff",
      employeeId: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("runs force logout through step-up after the credential check", async () => {
    renderView(linkedRecord());

    fireEvent.click(await screen.findByRole("button", { name: "Force logout" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Force logout" })).getByRole("button", {
        name: "Force logout",
      }),
    );

    await waitFor(() =>
      expect(forceLogoutGridmasterUser).toHaveBeenCalledWith(USER, "fresh-token"),
    );
    expect(requireCredentialAssurance.mock.invocationCallOrder[0]).toBeLessThan(
      forceLogoutGridmasterUser.mock.invocationCallOrder[0],
    );
    expect(toast.success).toHaveBeenCalledWith("User sessions terminated");
  });

  it("changes nothing when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValueOnce(false);
    renderView(linkedRecord());

    fireEvent.click(await screen.findByRole("button", { name: "Force logout" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Force logout" })).getByRole("button", {
        name: "Force logout",
      }),
    );

    await waitFor(() => expect(stepUpRun).toHaveBeenCalled());
    expect(forceLogoutGridmasterUser).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("goes back and impersonates in the person's active organization", async () => {
    const { onBack, onImpersonate } = renderView(linkedRecord());

    fireEvent.click(await screen.findByRole("button", { name: "Impersonate" }));
    expect(onImpersonate).toHaveBeenCalledWith(USER, ORG);
    fireEvent.click(screen.getByRole("button", { name: "Back to all users" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("offers reinstate rather than impersonation for a terminated account", async () => {
    renderView(
      linkedRecord({
        profile: {
          ...linkedRecord().profile!,
          terminatedAt: "2026-09-02T00:00:00.000Z",
          terminatedBy: GRIDMASTER,
          terminatedReason: "Fraud",
        },
      }),
    );

    expect(await screen.findByRole("button", { name: "Reinstate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Impersonate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terminate account" })).not.toBeInTheDocument();
    expect(screen.getByText("Fraud")).toBeInTheDocument();
  });
});
