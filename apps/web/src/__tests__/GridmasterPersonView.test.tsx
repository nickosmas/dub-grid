import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import GridmasterPersonView from "@/components/gridmaster/person/GridmasterPersonView";
import type { GridmasterPersonTarget } from "@/features/gridmaster/client";
import type {
  GridmasterPersonRecord,
  GridmasterStaffRecord,
} from "@/features/gridmaster/person-record";
import type { Invitation } from "@/types";

const fetchGridmasterPerson = vi.fn();
const forceLogoutGridmasterUser = vi.fn();
const sendGridmasterPasswordReset = vi.fn();
const terminateGridmasterUser = vi.fn();
const reinstateGridmasterUser = vi.fn();
const updateGridmasterUserActivation = vi.fn();
const updateGridmasterPersonName = vi.fn();
const changeGridmasterPersonEmail = vi.fn();
const requireCredentialAssurance = vi.fn();
const stepUpRun = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterPerson: (...args: unknown[]) => fetchGridmasterPerson(...args),
  forceLogoutGridmasterUser: (...args: unknown[]) => forceLogoutGridmasterUser(...args),
  sendGridmasterPasswordReset: (...args: unknown[]) => sendGridmasterPasswordReset(...args),
  terminateGridmasterUser: (...args: unknown[]) => terminateGridmasterUser(...args),
  reinstateGridmasterUser: (...args: unknown[]) => reinstateGridmasterUser(...args),
  updateGridmasterUserActivation: (...args: unknown[]) => updateGridmasterUserActivation(...args),
  updateGridmasterPersonName: (...args: unknown[]) => updateGridmasterPersonName(...args),
  changeGridmasterPersonEmail: (...args: unknown[]) => changeGridmasterPersonEmail(...args),
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
const BIRCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function staffRecord(overrides: Partial<GridmasterStaffRecord> = {}): GridmasterStaffRecord {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    orgId: ORG,
    employeeNumber: 7,
    firstName: "Ada",
    lastName: "Lovelace",
    employmentType: "part_time",
    status: "inactive",
    statusChangedAt: "2026-08-01T00:00:00.000Z",
    statusNote: "On leave",
    certificationId: 2,
    roleIds: [8],
    seniority: 3,
    focusAreaIds: [5],
    phone: "555-0100",
    email: "ada@example.com",
    contactNotes: "Prefers text",
    archivedAt: null,
    userId: USER,
    departmentIds: [3],
    deptAdminIds: [3],
    version: 4,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: ADMIN,
    updatedBy: ADMIN,
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

function invitationRecord(overrides: Partial<Invitation>): Invitation {
  return {
    id: "inv",
    orgId: ORG,
    invitedBy: ADMIN,
    email: "ada@example.com",
    roleToAssign: "user",
    expiresAt: FUTURE,
    acceptedAt: null,
    revokedAt: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: null,
    employeeId: null,
    ...overrides,
  };
}

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
    security: {
      twoFactor: { enabled: false, reenrollRequiredAt: null, factors: [] },
      knownDevices: [],
    },
    sessions: { sessions: [], pushDevices: [], calendarFeeds: [] },
    organizations: [
      {
        org: { id: ORG, name: "Calm Haven", slug: "calmhaven" },
        terminology: {
          focusAreaLabel: "Wings",
          certificationLabel: "Skill Levels",
          roleLabel: "Positions",
          departmentLabel: "Units",
        },
        names: {
          departments: { 3: "Nursing" },
          focusAreas: { 5: "East Wing" },
          roles: { 8: "Charge" },
          certifications: { 2: "RN" },
        },
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
          updatedAt: "2026-01-03T00:00:00.000Z",
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
  const onOpenOrganization = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GridmasterPersonView
        target={target}
        onBack={onBack}
        onImpersonate={onImpersonate}
        onOpenOrganization={onOpenOrganization}
      />
    </QueryClientProvider>,
  );
  return { onBack, onImpersonate, onOpenOrganization };
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
    expect(within(states).getByText("Sign-in locked")).toBeInTheDocument();
    expect(within(states).getByText("Being impersonated")).toBeInTheDocument();
    expect(screen.getByText(/by admin@example\.com/)).toBeInTheDocument();
  });

  it("shows the sign-in record, profile and consent history", async () => {
    renderView(linkedRecord());

    expect(await screen.findByText("Sign-in email")).toBeInTheDocument();
    expect(screen.getAllByText("ada@example.com").length).toBeGreaterThan(0);
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

  it("shows one card per organization with its membership, staff record and invitations", async () => {
    const base = linkedRecord();
    const calm = base.organizations[0];
    const { onOpenOrganization } = renderView(
      linkedRecord({
        organizations: [
          {
            ...calm,
            membership: {
              ...calm.membership!,
              adminPermissions: { canManageEmployees: true } as never,
              deptAdminIds: [3],
              onboardingCompletedAt: "2026-01-04T00:00:00.000Z",
              tooltipToursCompleted: { schedule: true },
            },
            employees: [staffRecord()],
            invitations: [
              invitationRecord({ id: "a", acceptedAt: "2026-01-03T00:00:00.000Z" }),
              invitationRecord({ id: "r", revokedAt: "2025-12-20T00:00:00.000Z" }),
              invitationRecord({ id: "e", expiresAt: "2025-06-04T00:00:00.000Z" }),
              invitationRecord({ id: "p" }),
            ],
          },
          {
            ...calm,
            org: { id: BIRCH, name: "Birch Court", slug: null },
            membership: {
              ...calm.membership!,
              id: "m-2",
              orgRole: "user",
              archivedAt: "2026-03-01T00:00:00.000Z",
              archivedBy: ADMIN,
            },
          },
        ],
      }),
    );

    const calmCard = (await screen.findByRole("heading", { name: "Calm Haven" })).closest(
      "section",
    ) as HTMLElement;
    const card = within(calmCard);
    expect(card.getByText("Admin")).toBeInTheDocument();
    expect(card.getAllByText("Units")).toHaveLength(2);
    expect(card.getByText("Wings")).toBeInTheDocument();
    expect(card.getByText("East Wing")).toBeInTheDocument();
    expect(card.getByText("Positions")).toBeInTheDocument();
    expect(card.getByText("Charge")).toBeInTheDocument();
    expect(card.getByText("Skill Levels")).toBeInTheDocument();
    expect(card.getByText("RN")).toBeInTheDocument();
    expect(card.getByText(/^Inactive since/)).toBeInTheDocument();
    expect(card.getByText("On leave")).toBeInTheDocument();
    expect(card.getByText("Part-time")).toBeInTheDocument();
    expect(card.getByText("Prefers text")).toBeInTheDocument();
    expect(card.getByText(/^Completed/)).toBeInTheDocument();
    expect(card.getByText("schedule")).toBeInTheDocument();
    expect(card.getAllByText(/by admin@example\.com/).length).toBeGreaterThan(1);
    for (const state of ["Accepted", "Revoked", "Expired", "Pending"]) {
      expect(card.getByText(state)).toBeInTheDocument();
    }

    const birchCard = screen
      .getByRole("heading", { name: "Birch Court" })
      .closest("section") as HTMLElement;
    expect(within(birchCard).getByText(/by admin@example\.com/)).toBeInTheDocument();
    expect(within(birchCard).getByText("No staff record.")).toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: "Open organization employees" }));
    expect(onOpenOrganization).toHaveBeenCalledWith(ORG);
  });

  it("shows an unlinked staff record's organization without a membership", async () => {
    const base = linkedRecord();
    renderView(
      linkedRecord({
        account: null,
        profile: null,
        organizations: [
          {
            ...base.organizations[0],
            membership: null,
            employees: [staffRecord({ userId: null, firstName: "Grace" })],
            invitations: [],
          },
        ],
      }),
      { kind: "staff", employeeId: "44444444-4444-4444-8444-444444444444" },
    );

    expect(await screen.findByText(/No membership/)).toBeInTheDocument();
    expect(screen.getAllByText("Grace Lovelace").length).toBeGreaterThan(1);
    expect(screen.getByText("No invitations sent.")).toBeInTheDocument();
  });

  it("saves the account name through step-up", async () => {
    updateGridmasterPersonName.mockResolvedValue({ success: true });
    renderView(linkedRecord());

    fireEvent.click(await screen.findByRole("button", { name: "Edit name" }));
    const dialog = screen.getByRole("dialog", { name: "Edit name" });
    fireEvent.change(within(dialog).getByLabelText("First name"), {
      target: { value: " Augusta " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save name" }));

    await waitFor(() =>
      expect(updateGridmasterPersonName).toHaveBeenCalledWith(
        USER,
        { firstName: "Augusta", lastName: "Lovelace" },
        "fresh-token",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Name saved");
  });

  it("changes the sign-in email through step-up after the credential check", async () => {
    changeGridmasterPersonEmail.mockResolvedValue({ success: true });
    renderView(linkedRecord());

    fireEvent.click(await screen.findByRole("button", { name: "Change sign-in email" }));
    const dialog = screen.getByRole("dialog", { name: "Change sign-in email" });
    fireEvent.change(within(dialog).getByLabelText("New sign-in email"), {
      target: { value: "augusta@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Change email" }));

    await waitFor(() =>
      expect(changeGridmasterPersonEmail).toHaveBeenCalledWith(
        USER,
        "augusta@example.com",
        "fresh-token",
      ),
    );
    expect(requireCredentialAssurance.mock.invocationCallOrder[0]).toBeLessThan(
      changeGridmasterPersonEmail.mock.invocationCallOrder[0],
    );
  });

  it("shows the server's reason when the email is taken", async () => {
    changeGridmasterPersonEmail.mockRejectedValue(
      new Error("That email belongs to a different user account."),
    );
    renderView(linkedRecord());

    fireEvent.click(await screen.findByRole("button", { name: "Change sign-in email" }));
    const dialog = screen.getByRole("dialog", { name: "Change sign-in email" });
    fireEvent.change(within(dialog).getByLabelText("New sign-in email"), {
      target: { value: "grace@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Change email" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That email belongs to a different user account."),
    );
    expect(screen.getByRole("dialog", { name: "Change sign-in email" })).toBeInTheDocument();
  });

  it("changes no email when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValueOnce(false);
    renderView(linkedRecord());

    fireEvent.click(await screen.findByRole("button", { name: "Change sign-in email" }));
    const dialog = screen.getByRole("dialog", { name: "Change sign-in email" });
    fireEvent.change(within(dialog).getByLabelText("New sign-in email"), {
      target: { value: "augusta@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Change email" }));

    await waitFor(() => expect(stepUpRun).toHaveBeenCalled());
    expect(changeGridmasterPersonEmail).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows the newest consent history first and the rest on request", async () => {
    const consents = Array.from({ length: 5 }, (_, index) => ({
      version: "1.2",
      consent: { essential: true, analytics: index === 0 },
      createdAt: `2026-09-2${index}T00:00:00.000Z`,
      userAgent: null,
    }));
    renderView(linkedRecord({ cookieConsents: consents }));

    expect(await screen.findAllByText(/^Cookies:/)).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Show 2 earlier" }));
    expect(screen.getAllByText(/^Cookies:/)).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByText(/^Cookies:/)).toHaveLength(3);
  });

  it("shows two-factor, known devices, sessions, push devices and calendar feeds", async () => {
    renderView(
      linkedRecord({
        loginLock: { locked: false, resetsAt: null },
        security: {
          twoFactor: {
            enabled: true,
            reenrollRequiredAt: null,
            factors: [
              {
                id: "f-1",
                type: "totp",
                name: "Work phone",
                status: "verified",
                createdAt: "2026-02-01T00:00:00.000Z",
                lastUsedAt: null,
              },
            ],
          },
          knownDevices: [
            {
              id: "d-1",
              platform: "ios",
              firstSeenAt: "2026-09-01T00:00:00.000Z",
              lastSeenAt: "2026-09-20T00:00:00.000Z",
            },
          ],
        },
        sessions: {
          sessions: [
            {
              id: "s-1",
              orgId: ORG,
              platform: "web",
              deviceLabel: "Macintosh",
              browser: "Chrome 151",
              appVersion: null,
              location: "Athens, GR",
              createdAt: "2026-09-25T00:00:00.000Z",
              lastActiveAt: "2026-09-26T08:00:00.000Z",
            },
          ],
          pushDevices: [
            {
              id: "p-1",
              orgId: ORG,
              platform: "android",
              lastSeenAt: null,
              disabledAt: "2026-09-10T00:00:00.000Z",
              createdAt: "2026-09-02T00:00:00.000Z",
            },
          ],
          calendarFeeds: [
            { id: "c-1", orgId: ORG, issuedAt: "2026-09-03T00:00:00.000Z", revokedAt: null },
          ],
        },
      }),
    );

    const security = (await screen.findByRole("heading", { name: "Security" })).closest(
      "section",
    ) as HTMLElement;
    expect(within(security).getByText("Work phone")).toBeInTheDocument();
    expect(within(security).getByText("Verified")).toBeInTheDocument();
    expect(within(security).getByText(/never used/)).toBeInTheDocument();
    expect(within(security).getByText(/^ios · first seen/)).toBeInTheDocument();
    expect(within(security).getByText("Not locked.")).toBeInTheDocument();

    const sessions = screen
      .getByRole("heading", { name: "Sessions and devices" })
      .closest("section") as HTMLElement;
    expect(within(sessions).getByText("Macintosh · Chrome 151")).toBeInTheDocument();
    expect(within(sessions).getByText(/Calm Haven · Athens, GR · started/)).toBeInTheDocument();
    expect(within(sessions).getByText(/^Off since/)).toBeInTheDocument();
    expect(within(sessions).getByText(/^issued/)).toBeInTheDocument();
  });

  it("shows empty states, and no security or sessions for a staff record", async () => {
    renderView(linkedRecord());
    expect(await screen.findByText("No factors enrolled.")).toBeInTheDocument();
    expect(screen.getByText(/No devices remembered/)).toBeInTheDocument();
    expect(screen.getByText("No sessions.")).toBeInTheDocument();
    expect(screen.getByText(/Not tracked here/)).toBeInTheDocument();
  });

  it("hides security and sessions for a staff record with no account", async () => {
    renderView(linkedRecord({ account: null, profile: null, security: null, sessions: null }), {
      kind: "staff",
      employeeId: "44444444-4444-4444-8444-444444444444",
    });
    expect(
      await screen.findByText(/has a staff record but has never signed in/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Security" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sessions and devices" })).not.toBeInTheDocument();
  });
});
