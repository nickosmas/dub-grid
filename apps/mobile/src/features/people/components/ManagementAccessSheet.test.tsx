import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

const useMutation = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const pushToast = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

vi.mock("@tanstack/react-query", () => ({
  onlineManager: { isOnline: () => true },
  useMutation,
  useQueryClient,
}));

vi.mock("../../auth/hooks/useAccessToken", () => ({ useAccessToken }));
vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast }),
}));

let ManagementAccessSheet: (typeof import("./ManagementAccessSheet"))["ManagementAccessSheet"];

beforeAll(async () => {
  ManagementAccessSheet = (await import("./ManagementAccessSheet")).ManagementAccessSheet;
});

const DEPARTMENTS = [
  { id: 9, name: "Operations", abbr: "OPS", type: "management" as const },
  { id: 10, name: "Facilities", abbr: "FAC", type: "management" as const },
];

function makePerson(overrides: Record<string, unknown> = {}) {
  return {
    id: "emp-1",
    employeeNumber: 12,
    firstName: "Mina",
    lastName: "Diaz",
    orgRole: null,
    employmentType: "full_time",
    phone: "555-0100",
    email: "mina@dubgrid.com",
    status: "active",
    certificationId: null,
    roleIds: [],
    seniority: 2,
    focusAreaIds: [2],
    departmentIds: [],
    deptAdminIds: [],
    managementDepartmentIds: [],
    managementDeptAdminIds: [],
    contactNotes: "",
    statusChangedAt: null,
    statusNote: "",
    userId: null,
    version: 7,
    membershipUpdatedAt: null,
    pendingInvitation: null,
    ...overrides,
  };
}

/** A plain app invitation, carrying no management departments at all. */
const STAFF_INVITATION = {
  id: "invite-1",
  email: "mina@dubgrid.com",
  expiresAt: "2099-05-01T00:00:00.000Z",
  updatedAt: "2026-04-28T00:00:00.000Z",
  roleToAssign: "user",
};

function allMutatePayloads(calls: Array<{ mutate: ReturnType<typeof vi.fn> }>) {
  return calls.flatMap((call) => call.mutate.mock.calls.map(([payload]) => payload));
}

describe("ManagementAccessSheet", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    pushToast.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useQueryClient.mockReturnValue({ invalidateQueries: vi.fn().mockResolvedValue(undefined) });
    useMutation.mockReturnValue({ error: null, isPending: false, mutate: vi.fn() });
  });

  function renderSheet(person: Record<string, unknown> = {}) {
    const mutationCalls: Array<{ mutate: ReturnType<typeof vi.fn> }> = [];
    useMutation.mockImplementation(() => {
      const mutate = vi.fn();
      mutationCalls.push({ mutate });
      return { error: null, isPending: false, mutate };
    });

    render(
      <ManagementAccessSheet
        managementDepartments={DEPARTMENTS}
        onDismiss={vi.fn()}
        person={makePerson(person) as never}
        visible
      />,
    );
    return mutationCalls;
  }

  it("names itself for whether they are already on the roster", () => {
    renderSheet();
    expect(screen.getByText("Add to management")).toBeInTheDocument();

    cleanup();
    renderSheet({ managementDepartmentIds: [9] });
    expect(screen.getByText("Edit management access")).toBeInTheDocument();
  });

  // The reported bug: `hasManagementAccess` also returned true for a plain app
  // invitation, which carries no departments, so someone merely invited to the
  // app was offered an edit and a removal for access they never had.
  it("treats a plain staff invitation as no management access", () => {
    renderSheet({ pendingInvitation: STAFF_INVITATION });

    expect(screen.getByText("Add to management")).toBeInTheDocument();
    expect(screen.getByText("Select at least one management department")).toBeInTheDocument();
  });

  // An empty selection means two different things either side of that line: a
  // missing answer while granting, a removal while editing.
  it("reads an empty selection as a missing answer for someone not on the roster yet", () => {
    renderSheet();

    expect(screen.getByText("Select at least one management department")).toBeInTheDocument();
    expect(screen.queryByText(/Saving now removes/)).not.toBeInTheDocument();
  });

  // Role changes belong to the access badge on the profile. This sheet asks
  // for a role only when nothing exists yet to hold one.
  it("keeps the access level off the sheet for someone who already has an account", () => {
    renderSheet({ userId: "user-1", orgRole: "admin", managementDepartmentIds: [9] });

    expect(screen.queryByText("Access level")).not.toBeInTheDocument();
  });

  it("keeps the access level off the sheet for someone holding a pending invitation", () => {
    renderSheet({ pendingInvitation: STAFF_INVITATION });

    expect(screen.queryByText("Access level")).not.toBeInTheDocument();
  });

  it("asks for an access level only for a brand-new invitation", () => {
    renderSheet({ userId: null });

    expect(screen.getByText("Access level")).toBeInTheDocument();
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
    // Two lists on one sheet each carry a header to tell them apart.
    expect(screen.getByText("Management Departments")).toBeInTheDocument();
  });

  // The sheet's title is the header. A lone departments list under it used
  // to restate its own name in a small label, which said nothing.
  it("leaves the header off a lone departments list", () => {
    renderSheet({ userId: "user-1", orgRole: "admin", managementDepartmentIds: [9] });

    expect(screen.queryByText("Management Departments")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Operations" })).toBeInTheDocument();
  });

  it("sends the picked departments, defaulting a fresh grant to User", () => {
    const mutationCalls = renderSheet();

    fireEvent.click(screen.getByText("Operations"));
    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(allMutatePayloads(mutationCalls)).toContainEqual({
      orgRole: "user",
      managementDepartmentIds: [9],
    });
  });

  it("opens on the role they already hold rather than resetting it", () => {
    const mutationCalls = renderSheet({
      orgRole: "admin",
      managementDepartmentIds: [9],
      userId: "user-1",
    });

    // Something has to change before Save will fire, so the seeded role rides
    // along on a department edit.
    fireEvent.click(screen.getByText("Facilities"));
    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(allMutatePayloads(mutationCalls)).toContainEqual({
      orgRole: "admin",
      managementDepartmentIds: [9, 10],
    });
  });

  // Save used to be live the moment the sheet opened, so the everyday "opened it
  // to check, closed it again" ended in a no-op write.
  it("holds Save until something actually changes", () => {
    const mutationCalls = renderSheet({
      orgRole: "admin",
      managementDepartmentIds: [9],
      userId: "user-1",
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));
    expect(allMutatePayloads(mutationCalls)).toHaveLength(0);

    fireEvent.click(screen.getByText("Facilities"));
    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));
    expect(allMutatePayloads(mutationCalls)).toHaveLength(1);
  });

  it("refuses to submit with no department selected", () => {
    const mutationCalls = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(allMutatePayloads(mutationCalls)).toHaveLength(0);
  });

  // Clearing every department is the removal path, so an empty draft has to
  // keep Save live and say what saving it would do.
  it("turns an emptied selection into a removal, behind the confirmation", () => {
    const mutationCalls = renderSheet({
      orgRole: "admin",
      managementDepartmentIds: [9],
      userId: "user-1",
    });

    fireEvent.click(screen.getByText("Operations"));

    expect(
      screen.getByText(
        "Saving now removes their management access. Their staff profile stays as it is.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(allMutatePayloads(mutationCalls)).toHaveLength(0);
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Remove Access" }),
    );

    expect(allMutatePayloads(mutationCalls).filter((payload) => payload?.remove)).toHaveLength(1);
  });

  it("submits one removal when the destructive confirmation is pressed twice", () => {
    const mutationCalls = renderSheet({
      orgRole: "admin",
      managementDepartmentIds: [9],
      userId: "user-1",
    });

    fireEvent.click(screen.getByText("Operations"));
    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));
    const confirm = within(screen.getByRole("alert")).getByRole("button", {
      name: "Remove Access",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(allMutatePayloads(mutationCalls).filter((payload) => payload?.remove)).toHaveLength(1);
  });
});
