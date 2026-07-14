import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
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
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    pushToast.mockReset();
    routerPush.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({
      data: {
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

  it("shows the loading state while the directory is being fetched", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.getByText("Loading directory")).toBeInTheDocument();
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
      pathname: "/(tabs)/people/[id]",
      params: { id: "emp-1" },
    });
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
  });

  it("shows management users to regular users without opening their profile", () => {
    useBootstrap.mockReturnValue({
      data: {
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
      pathname: "/(tabs)/people/[id]",
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

  it("filters the directory by true management department from the filter modal", () => {
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
            departmentIds: [4],
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
            firstName: "June",
            lastName: "Patel",
            phone: "555-0101",
            email: "june@dubgrid.com",
            status: "active",
            certificationId: null,
            focusAreaIds: [],
            roleIds: [],
            departmentIds: [],
            deptAdminIds: [],
            managementDepartmentIds: [10],
            managementDeptAdminIds: [],
            seniority: 2,
            userId: "user-2",
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
    fireEvent.click(screen.getByText("Clinical Leadership"));

    expect(screen.queryByText("Mina Diaz")).not.toBeInTheDocument();
    expect(screen.getByText("June Patel")).toBeInTheDocument();
  });
});
