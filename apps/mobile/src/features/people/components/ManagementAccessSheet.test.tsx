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
  // app was offered "Edit"/"Remove" for management access they never had.
  it("treats a plain staff invitation as no management access", () => {
    renderSheet({ pendingInvitation: STAFF_INVITATION });

    expect(screen.getByText("Add to management")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove from Management" }),
    ).not.toBeInTheDocument();
  });

  it("offers no removal to someone not on the roster yet", () => {
    renderSheet();

    expect(
      screen.queryByRole("button", { name: "Remove from Management" }),
    ).not.toBeInTheDocument();
  });

  // The tier list used to depend on whether they had an account, so the same
  // sheet showed three options for one person and two for another with nothing
  // on screen saying why.
  it("offers Super Admin to someone who already has an account", () => {
    renderSheet({ userId: "user-1", managementDepartmentIds: [9] });

    expect(screen.getByText("Super Admin")).toBeInTheDocument();
  });

  it("offers Super Admin on the invitation path too", () => {
    renderSheet({ userId: null });

    expect(screen.getByText("Super Admin")).toBeInTheDocument();
  });

  it("sends the picked departments, defaulting a fresh grant to User", () => {
    const mutationCalls = renderSheet();

    fireEvent.click(screen.getByText("OPS"));
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
    fireEvent.click(screen.getByText("FAC"));
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

    fireEvent.click(screen.getByText("FAC"));
    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));
    expect(allMutatePayloads(mutationCalls)).toHaveLength(1);
  });

  it("refuses to submit with no department selected", () => {
    const mutationCalls = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(allMutatePayloads(mutationCalls)).toHaveLength(0);
  });

  it("asks before replacing a pending invitation's access level", () => {
    const mutationCalls = renderSheet({
      managementDepartmentIds: [9],
      pendingInvitation: { ...STAFF_INVITATION, roleToAssign: "user" },
    });

    fireEvent.click(screen.getByText("Admin"));
    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(screen.getByText("Replace invitation access?")).toBeInTheDocument();
    expect(allMutatePayloads(mutationCalls)).toHaveLength(0);

    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Revoke and resend" }),
    );
    expect(allMutatePayloads(mutationCalls)).toContainEqual({
      orgRole: "admin",
      managementDepartmentIds: [9],
    });
  });

  it("submits one removal when the destructive confirmation is pressed twice", () => {
    const mutationCalls = renderSheet({
      orgRole: "admin",
      managementDepartmentIds: [9],
      userId: "user-1",
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove from Management" }));
    const confirm = within(screen.getByRole("alert")).getByRole("button", {
      name: "Remove Access",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(allMutatePayloads(mutationCalls).filter((payload) => payload?.remove)).toHaveLength(1);
  });
});
