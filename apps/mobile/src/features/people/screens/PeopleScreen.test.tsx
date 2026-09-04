import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const pushToast = vi.fn();
const routerPush = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("@expo/vector-icons/FontAwesome6", () => ({
  default: () => null,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    onlineManager: {
      ...actual.onlineManager,
      isOnline: () => true,
    },
    useMutation,
    useQuery,
    // The roster's actions sheet invalidates through the client directly, and
    // the real hook needs a provider this harness doesn't mount.
    useQueryClient,
  };
});

vi.mock("expo-router", () => ({
  router: {
    push: routerPush,
  },
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

let PeopleScreen: (typeof import("./PeopleScreen"))["default"];

beforeAll(async () => {
  PeopleScreen = (await import("./PeopleScreen")).default;
});

describe("PeopleScreen", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useQueryClient.mockReset();
    useQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    pushToast.mockReset();
    routerPush.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [
          {
            id: 2,
            name: "Skilled Nursing",
          },
          {
            id: 5,
            name: "Memory Care",
          },
        ],
        departments: [
          {
            id: 10,
            name: "Clinical Leadership",
            abbr: "CL",
            type: "management",
          },
          {
            id: 11,
            name: "Operations",
            abbr: "OPS",
            type: "management",
          },
        ],
        permissions: {
          canManageEmployees: true,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });
  });

  function buildPerson(overrides: Record<string, unknown>) {
    return {
      firstName: "Mina",
      lastName: "Diaz",
      phone: "555-0100",
      email: "mina@dubgrid.com",
      status: "active",
      employmentType: "full_time",
      certificationId: null,
      focusAreaIds: [],
      roleIds: [],
      departmentIds: [],
      deptAdminIds: [],
      managementDepartmentIds: [],
      managementDeptAdminIds: [],
      seniority: 1,
      userId: null,
      pendingInvitation: null,
      contactNotes: "",
      statusChangedAt: "2026-04-24T12:00:00.000Z",
      statusNote: "",
      version: 7,
      ...overrides,
    };
  }

  function buildManagementUser(overrides: Record<string, unknown>) {
    return {
      source: "member",
      userId: null,
      employeeId: null,
      employeeStatus: null,
      firstName: "Nora",
      lastName: "Blake",
      email: "nora@dubgrid.com",
      phone: "",
      orgRole: "admin",
      managementDepartmentIds: [10],
      managementDeptAdminIds: [],
      updatedAt: null,
      invitationId: null,
      invitationExpiresAt: null,
      ...overrides,
    };
  }

  /** A directory with both halves populated, for the tab-scoped filters. */
  function mockManagementRoster() {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [{ id: 2, name: "Skilled Nursing" }],
        certifications: [{ id: 3, name: "RN" }],
        departments: [{ id: 10, name: "Clinical Leadership", abbr: "CL", type: "management" }],
        user: { id: "user-1" },
        permissions: {
          canManageEmployees: true,
          canManageManagementAccess: true,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: {
        people: [
          buildPerson({ id: "emp-1", firstName: "Mina", lastName: "Diaz" }),
          buildPerson({ id: "emp-2", firstName: "June", lastName: "Patel", seniority: 2 }),
        ],
        managementUsers: [
          buildManagementUser({
            id: "mgmt-1",
            userId: "user-9",
            firstName: "Nora",
            lastName: "Blake",
            orgRole: "super_admin",
          }),
          buildManagementUser({
            id: "mgmt-2",
            source: "pending_invite",
            firstName: "Ida",
            lastName: "Shaw",
            email: "ida@dubgrid.com",
            orgRole: "admin",
          }),
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
  }

  it("shows the loading state while the directory is being fetched", async () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    // Held back briefly so a fast response never flashes a skeleton.
    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();

    expect(await screen.findByTestId("skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading directory")).not.toBeInTheDocument();
  });

  it("shows a locked state when the user lacks directory access", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: new Error("Unauthorized"),
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.getByText("Directory unavailable")).toBeInTheDocument();
  });

  it("shows the empty state when the organization has no teammates yet", () => {
    useQuery.mockReturnValue({
      data: {
        people: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.getByText("No teammates yet")).toBeInTheDocument();
  });

  it("shows plain person rows and opens details by tapping a user", () => {
    useQuery.mockReturnValue({
      data: {
        people: [
          {
            id: "emp-1",
            firstName: "Mina",
            lastName: "Diaz",
            orgRole: "admin",
            phone: "555-0100",
            email: "mina@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [2],
            roleIds: [3],
            departmentIds: [4],
            deptAdminIds: [],
            seniority: 1,
            userId: null,
            pendingInvitation: null,
            contactNotes: "Weekend availability",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 7,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Skilled Nursing")).toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Mina Diaz"));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/person/[id]",
      params: { id: "emp-1" },
    });
  });

  // Every roster row opens the one profile page there is: your own goes to the
  // profile tab, everyone else's to their staff profile, which carries their
  // management access along with the rest of their record. There used to be a
  // second profile screen behind these rows saying a subset of the same thing.
  it("opens management rows in the one profile page there is", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [],
        departments: [{ id: 10, name: "Clinical Leadership", abbr: "CL", type: "management" }],
        user: { id: "user-1" },
        permissions: {
          canManageEmployees: true,
          canManageManagementAccess: true,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    // One object serves both `useQuery` calls the screen makes.
    useQuery.mockReturnValue({
      data: {
        people: [],
        managementUsers: [
          {
            id: "mgmt-1",
            source: "member",
            userId: "user-1",
            employeeId: null,
            employeeStatus: null,
            firstName: "Mina",
            lastName: "Diaz",
            email: "mina@dubgrid.com",
            phone: "",
            orgRole: "super_admin",
            managementDepartmentIds: [10],
            managementDeptAdminIds: [],
            updatedAt: null,
            invitationId: null,
            invitationExpiresAt: null,
          },
          {
            id: "mgmt-2",
            source: "member",
            userId: "user-2",
            employeeId: "emp-2",
            employeeStatus: null,
            firstName: "Ava",
            lastName: "Cole",
            email: "ava@dubgrid.com",
            phone: "",
            orgRole: "admin",
            managementDepartmentIds: [10],
            managementDeptAdminIds: [],
            updatedAt: null,
            invitationId: null,
            invitationExpiresAt: null,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("Management"));
    fireEvent.click(screen.getByText("Done"));

    fireEvent.click(screen.getByText("Mina Diaz"));
    expect(routerPush).toHaveBeenCalledWith("/(tabs)/profile");

    routerPush.mockClear();
    fireEvent.click(screen.getByText("Ava Cole"));
    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/person/[id]",
      params: { id: "emp-2" },
    });
  });

  // A management-only invitation has no `employees` row until it is accepted,
  // so there is no staff profile to open — and no second profile screen to
  // fall back on any more. Its actions come up on the roster instead.
  it("opens an actions sheet for a management user with no staff profile", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [],
        departments: [{ id: 10, name: "Clinical Leadership", abbr: "CL", type: "management" }],
        user: { id: "user-1" },
        permissions: {
          canManageEmployees: true,
          canManageManagementAccess: true,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: {
        people: [],
        managementUsers: [
          {
            id: "inv:9",
            source: "pending_invite",
            userId: null,
            employeeId: null,
            employeeStatus: null,
            firstName: "Jo",
            lastName: "Park",
            email: "jo@dubgrid.com",
            phone: "",
            orgRole: "admin",
            managementDepartmentIds: [10],
            managementDeptAdminIds: [],
            updatedAt: null,
            invitationId: "9",
            invitationExpiresAt: null,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("Management"));
    fireEvent.click(screen.getByText("Done"));
    fireEvent.click(screen.getByText("Jo Park"));

    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reinvite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Management Access" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke Invitation" })).toBeInTheDocument();
    // The sheet names the departments too — the row behind it already does, so
    // both are on screen.
    expect(screen.getAllByText("Clinical Leadership").length).toBeGreaterThan(1);
  });

  it("asks before replacing a management-only pending invitation's access", async () => {
    const mutateCalls: ReturnType<typeof vi.fn>[] = [];
    useMutation.mockImplementation(() => {
      const mutate = vi.fn();
      mutateCalls.push(mutate);
      return { error: null, isPending: false, mutate, mutateAsync: vi.fn() };
    });
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [],
        departments: [{ id: 10, name: "Clinical Leadership", abbr: "CL", type: "management" }],
        user: { id: "user-1" },
        permissions: {
          canManageEmployees: true,
          canManageManagementAccess: true,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: {
        people: [],
        managementUsers: [
          {
            id: "inv:9",
            source: "pending_invite",
            userId: null,
            employeeId: null,
            employeeStatus: null,
            firstName: "Jo",
            lastName: "Park",
            email: "jo@dubgrid.com",
            phone: "",
            orgRole: "admin",
            managementDepartmentIds: [10],
            managementDeptAdminIds: [],
            updatedAt: "2026-04-28T00:00:00.000Z",
            invitationId: "9",
            invitationExpiresAt: "2099-05-01T00:00:00.000Z",
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("Management"));
    fireEvent.click(screen.getByText("Done"));
    fireEvent.click(screen.getByText("Jo Park"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Management Access" }));
    // The access sheet is presented only once the actions sheet has finished
    // leaving: iOS refuses a present that overlaps a dismiss.
    fireEvent.click(await screen.findByText("Super Admin"));
    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(screen.getByText("Replace invitation access?")).toBeInTheDocument();
    expect(screen.getByText(/current invitation will be revoked/i)).toBeInTheDocument();
    expect(mutateCalls.flatMap((mutate) => mutate.mock.calls)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Revoke and resend" }));
    expect(
      mutateCalls.flatMap((mutate) => mutate.mock.calls).map(([payload]) => payload),
    ).toContainEqual({
      orgRole: "super_admin",
      managementDepartmentIds: [10],
    });
  });

  it("navigates to the add-person screen for admins who can manage employees", () => {
    useQuery.mockReturnValue({
      data: { people: [] },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Add person"));

    expect(routerPush).toHaveBeenCalledWith("/people/add");
  });

  it("sorts the directory by seniority by default", () => {
    useQuery.mockReturnValue({
      data: {
        people: [
          {
            id: "emp-1",
            firstName: "Zoe",
            lastName: "Adams",
            phone: "555-0100",
            email: "zoe@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [2],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            seniority: 1,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 7,
          },
          {
            id: "emp-2",
            firstName: "Mina",
            lastName: "Diaz",
            phone: "555-0101",
            email: "mina@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [2],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            seniority: 3,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 3,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    const zoeRow = screen.getByText("Zoe Adams");
    const minaRow = screen.getByText("Mina Diaz");
    expect(zoeRow.compareDocumentPosition(minaRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("can switch the directory sort to alphabetical", () => {
    useQuery.mockReturnValue({
      data: {
        people: [
          {
            id: "emp-1",
            firstName: "Zoe",
            lastName: "Adams",
            phone: "555-0100",
            email: "zoe@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [2],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            seniority: 1,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 7,
          },
          {
            id: "emp-2",
            firstName: "Mina",
            lastName: "Diaz",
            phone: "555-0101",
            email: "mina@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [2],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            seniority: 3,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 3,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("Alphabetical"));

    const minaRow = screen.getByText("Mina Diaz");
    const zoeRow = screen.getByText("Zoe Adams");
    expect(minaRow.compareDocumentPosition(zoeRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides inactive staff and status pills from regular users", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [{ id: 2, name: "Skilled Nursing" }],
        permissions: {
          canManageEmployees: false,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: {
        people: [
          {
            id: "emp-1",
            firstName: "Mina",
            lastName: "Diaz",
            phone: "555-0100",
            email: "mina@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [2],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            seniority: 1,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 7,
          },
          {
            id: "emp-2",
            firstName: "Owen",
            lastName: "Lee",
            phone: "555-0101",
            email: "owen@dubgrid.com",
            status: "inactive",
            certificationId: null,
            focusAreaIds: [2],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            seniority: 2,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 3,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.getByText("Mina Diaz")).toBeInTheDocument();
    expect(screen.queryByText("Owen Lee")).not.toBeInTheDocument();
    expect(screen.queryByText(/Active 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Inactive/)).not.toBeInTheDocument();
    expect(screen.queryByText("No app access")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add person")).not.toBeInTheDocument();
  });

  it("excludes self and hides employment details and administrative filters for regular users", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [{ id: 2, name: "Skilled Nursing" }],
        certifications: [],
        roles: [{ id: 9, name: "Charge Nurse", abbr: "CN" }],
        user: { id: "user-self" },
        linkedEmployee: { id: "emp-self" },
        permissions: { canManageEmployees: false },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: {
        people: [
          buildPerson({ id: "emp-self", firstName: "Current", userId: "user-self" }),
          buildPerson({ id: "emp-2", firstName: "Mina", focusAreaIds: [2], roleIds: [9] }),
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.queryByText("Current Diaz")).not.toBeInTheDocument();
    expect(screen.getByText("Mina Diaz")).toBeInTheDocument();
    expect(screen.queryByText("FT")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    expect(screen.queryByText("Employment type")).not.toBeInTheDocument();
    expect(screen.queryByText("App access")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.getByText("Focus area")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Sort by")).toBeInTheDocument();
  });

  it("matches regular-user search against qualifications but not hidden contact fields", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [{ id: 2, name: "Skilled Nursing" }],
        certifications: [{ id: 7, name: "Registered Nurse", abbr: "RN" }],
        roles: [{ id: 9, name: "Charge Nurse", abbr: "CN" }],
        permissions: { canManageEmployees: false },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: {
        people: [
          buildPerson({
            id: "emp-2",
            email: "private@dubgrid.com",
            focusAreaIds: [2],
            certificationId: 7,
            roleIds: [9],
          }),
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    fireEvent.change(screen.getByLabelText("Search people"), {
      target: { value: "private@dubgrid.com" },
    });
    expect(screen.queryByText("Mina Diaz")).not.toBeInTheDocument();
    expect(screen.getByText("No matches")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search people"), {
      target: { value: "Charge Nurse" },
    });
    expect(screen.getByText("Mina Diaz")).toBeInTheDocument();
  });

  it("shows management users to regular users without opening their profile", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [{ id: 2, name: "Skilled Nursing" }],
        permissions: {
          canManageEmployees: false,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: {
        people: [
          {
            id: "emp-1",
            firstName: "Mina",
            lastName: "Diaz",
            phone: "555-0100",
            email: "mina@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [2],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            managementDepartmentIds: [],
            managementDeptAdminIds: [],
            seniority: 1,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 7,
          },
          {
            id: "emp-2",
            firstName: "Ava",
            lastName: "Cole",
            orgRole: "admin",
            phone: "555-0102",
            email: "ava@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            managementDepartmentIds: [10],
            managementDeptAdminIds: [],
            seniority: 2,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 3,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.getByText("Ava Cole")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Ava Cole"));
    expect(routerPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Mina Diaz"));
    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/person/[id]",
      params: { id: "emp-1" },
    });
  });

  it("filters the directory by focus area from the filter button", () => {
    useQuery.mockReturnValue({
      data: {
        people: [
          {
            id: "emp-1",
            firstName: "Mina",
            lastName: "Diaz",
            phone: "555-0100",
            email: "mina@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [2],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            seniority: 1,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 7,
          },
          {
            id: "emp-2",
            firstName: "June",
            lastName: "Patel",
            phone: "555-0101",
            email: "june@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [5],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            seniority: 2,
            userId: null,
            pendingInvitation: null,
            contactNotes: "",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 3,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    const memoryCareOptions = screen.getAllByText("Memory Care");
    fireEvent.click(memoryCareOptions[0]);

    expect(screen.queryByText("Mina Diaz")).not.toBeInTheDocument();
    expect(screen.getByText("June Patel")).toBeInTheDocument();
  });

  // The staff sheet only offers what a staff row carries. Management
  // department moved to the management tab, which is the list it describes.
  it("filters the staff directory by certification from the filter modal", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { department: "Departments" } },
        focusAreas: [],
        certifications: [
          { id: 3, name: "RN" },
          { id: 4, name: "LPN" },
        ],
        departments: [],
        permissions: { canManageEmployees: true },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: {
        people: [
          buildPerson({ id: "emp-1", firstName: "Mina", lastName: "Diaz", certificationId: 3 }),
          buildPerson({
            id: "emp-2",
            firstName: "June",
            lastName: "Patel",
            certificationId: 4,
            seniority: 2,
          }),
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("RN"));

    expect(screen.queryByText("June Patel")).not.toBeInTheDocument();
    expect(screen.getByText("Mina Diaz")).toBeInTheDocument();
  });

  it("filters the staff directory by app access from the filter modal", () => {
    useQuery.mockReturnValue({
      data: {
        people: [
          buildPerson({ id: "emp-1", firstName: "Mina", lastName: "Diaz", userId: "user-3" }),
          buildPerson({ id: "emp-2", firstName: "June", lastName: "Patel", seniority: 2 }),
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("No app access"));

    expect(screen.queryByText("Mina Diaz")).not.toBeInTheDocument();
    expect(screen.getByText("June Patel")).toBeInTheDocument();
  });

  // The staff sheet's sections would all be dead controls against the roster,
  // so the management tab swaps in the ones its own rows can answer.
  it("swaps the filter sheet for management filters on the management tab", () => {
    mockManagementRoster();

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    expect(screen.getByText("Focus area")).toBeInTheDocument();
    expect(screen.queryByText("Access level")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Management"));

    expect(screen.queryByText("Focus area")).not.toBeInTheDocument();
    expect(screen.queryByText("Employment type")).not.toBeInTheDocument();
    expect(screen.getByText("Management department")).toBeInTheDocument();
    expect(screen.getByText("Invitation")).toBeInTheDocument();
    // Twice: the section of access-level filters, and the sort by it.
    expect(screen.getAllByText("Access level")).toHaveLength(2);
  });

  it("filters the management roster by access level", () => {
    mockManagementRoster();

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("Management"));
    // Also a badge on the row behind the sheet; the sheet's row comes first.
    fireEvent.click(screen.getAllByText("Super Admin")[0]);

    expect(screen.getByText("Nora Blake")).toBeInTheDocument();
    expect(screen.queryByText("Ida Shaw")).not.toBeInTheDocument();
  });

  it("filters the management roster down to pending invitations", () => {
    mockManagementRoster();

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("Management"));
    fireEvent.click(screen.getAllByText("Invitation pending")[0]);

    expect(screen.getByText("Ida Shaw")).toBeInTheDocument();
    expect(screen.queryByText("Nora Blake")).not.toBeInTheDocument();
  });

  // Each half keeps its own filters, so one list's narrowing never follows
  // the tab switch onto the other.
  it("keeps each tab's filters to itself", () => {
    mockManagementRoster();

    render(<PeopleScreen />);

    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("Management"));
    fireEvent.click(screen.getAllByText("Invitation pending")[0]);
    fireEvent.click(screen.getByText("Done"));
    fireEvent.click(screen.getByLabelText("Open people filters and sort"));
    fireEvent.click(screen.getByText("Schedule"));

    expect(screen.getByText("Mina Diaz")).toBeInTheDocument();
    expect(screen.getByText("June Patel")).toBeInTheDocument();
  });
});
