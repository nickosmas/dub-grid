import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiResponseError } from "@dubgrid/api-client";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const useLocalSearchParams = vi.fn();
const pushToast = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("@expo/vector-icons/FontAwesome6", () => ({
  default: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  onlineManager: {
    isOnline: () => true,
  },
  useMutation,
  useQuery,
  useQueryClient,
}));

vi.mock("expo-router", () => ({
  Stack: {
    Screen: () => null,
  },
  useLocalSearchParams,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("../../../shared/navigation/top-level-stack", () => ({
  createDetailStackOptions: () => ({}),
}));

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

let PersonDetailScreen: (typeof import("./PersonDetailScreen"))["default"];

beforeAll(async () => {
  PersonDetailScreen = (await import("./PersonDetailScreen")).default;
});

function confirmDialog(label: string) {
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: label }));
}

describe("PersonDetailScreen", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    useLocalSearchParams.mockReset();
    pushToast.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useLocalSearchParams.mockReturnValue({
      id: "emp-1",
    });
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: {
          labels: {
            focusArea: "Focus Areas",
            role: "Roles",
            certification: "Certification",
            department: "Departments",
          },
        },
        focusAreas: [{ id: 2, name: "Skilled Nursing", departmentId: 4 }],
        roles: [{ id: 3, name: "Charge Nurse" }],
        certifications: [],
        departments: [{ id: 4, name: "North Wing" }],
        permissions: {
          canManageEmployees: true,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQueryClient.mockReturnValue({
      setQueryData: vi.fn(),
    });
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });
  });

  it("fetches the selected person directly and avoids duplicate active account copy", () => {
    useQuery.mockReturnValue({
      data: {
        person: {
          id: "emp-1",
          firstName: "Mina",
          lastName: "Diaz",
          orgRole: "super_admin",
          employmentType: "full_time",
          phone: "(415) 425-3334",
          email: "mina@dubgrid.com",
          status: "active",
          certificationId: null,
          roleIds: [3],
          seniority: 2,
          focusAreaIds: [2],
          departmentIds: [4],
          deptAdminIds: [],
          contactNotes: "Weekend availability",
          statusChangedAt: null,
          statusNote: "",
          userId: "user-1",
          version: 7,
          pendingInvitation: null,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(useQuery.mock.calls[0]?.[0]?.queryKey).toEqual([
      "mobile",
      "person",
      "token-123",
      "emp-1",
    ]);
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
    expect(screen.getAllByText("Active app account")).toHaveLength(1);
    expect(screen.getAllByText("Charge Nurse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Account access")).not.toBeInTheDocument();
    expect(screen.queryByText("Status updated")).not.toBeInTheDocument();
  });

  it("omits the account access section even when the person still needs app access", () => {
    useQuery.mockReturnValue({
      data: {
        person: {
          id: "emp-1",
          firstName: "Mina",
          lastName: "Diaz",
          employmentType: "full_time",
          phone: "(415) 425-3334",
          email: "mina@dubgrid.com",
          status: "active",
          certificationId: null,
          roleIds: [3],
          seniority: 2,
          focusAreaIds: [2],
          departmentIds: [4],
          deptAdminIds: [],
          contactNotes: "",
          statusChangedAt: "2026-04-24T12:00:00.000Z",
          statusNote: "",
          userId: null,
          version: 7,
          pendingInvitation: {
            id: "invite-1",
            email: "mina@dubgrid.com",
            expiresAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-04-28T00:00:00.000Z",
          },
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.queryByText("Account access")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending for mina@dubgrid.com")).not.toBeInTheDocument();
    expect(screen.getByText("Status updated")).toBeInTheDocument();
  });

  it("shows a grouped edit flow with dedicated save and discard actions", () => {
    useQuery.mockReturnValue({
      data: {
        person: {
          id: "emp-1",
          firstName: "Mina",
          lastName: "Diaz",
          employmentType: "full_time",
          phone: "(415) 425-3334",
          email: "mina@dubgrid.com",
          status: "active",
          certificationId: null,
          roleIds: [3],
          seniority: 2,
          focusAreaIds: [2],
          departmentIds: [4],
          deptAdminIds: [],
          contactNotes: "Weekend availability",
          statusChangedAt: null,
          statusNote: "",
          userId: "user-1",
          version: 7,
          pendingInvitation: null,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    fireEvent.click(screen.getByText("Edit"));

    expect(screen.getByText("Basic info")).toBeInTheDocument();
    expect(screen.getByText("Staffing")).toBeInTheDocument();
    expect(screen.getByText("Assignments")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Discard")).toBeInTheDocument();
    expect(screen.getByText("Save changes")).toBeInTheDocument();
    expect(screen.queryByText("Call")).not.toBeInTheDocument();
    expect(screen.queryByText("Bench")).not.toBeInTheDocument();
  });

  it("shows account found before asking to reconcile a different-name existing account", async () => {
    const mutationCalls: Array<{
      mutate: ReturnType<typeof vi.fn>;
      options: {
        onError?: (error: unknown) => void;
      };
    }> = [];
    const accountFoundError = new ApiResponseError(
      "An existing account was found for this email.",
      409,
      {
        code: "ACCOUNT_FOUND",
        details: {
          employeeId: "emp-1",
          userId: "user-1",
          employeeFirstName: "Mina",
          employeeLastName: "Diaz",
          accountFirstName: "Minnie",
          accountLastName: "Diaz",
        },
      },
    );
    const mismatchError = new ApiResponseError(
      "The user account name does not match the employee record.",
      409,
      {
        code: "NAME_MISMATCH",
        details: {
          employeeId: "emp-1",
          userId: "user-1",
          employeeFirstName: "Mina",
          employeeLastName: "Diaz",
          accountFirstName: "Minnie",
          accountLastName: "Diaz",
        },
      },
    );
    const invitationErrors = [accountFoundError, mismatchError];

    useMutation.mockImplementation((options) => {
      const mutate = vi.fn(() => {
        options.onError?.(invitationErrors.shift() ?? mismatchError);
      });
      mutationCalls.push({ mutate, options });
      return {
        error: null,
        isPending: false,
        mutate,
      };
    });
    useQuery.mockReturnValue({
      data: {
        person: {
          id: "emp-1",
          firstName: "Mina",
          lastName: "Diaz",
          employmentType: "full_time",
          phone: "(415) 425-3334",
          email: "mina@dubgrid.com",
          status: "active",
          certificationId: null,
          roleIds: [3],
          seniority: 2,
          focusAreaIds: [2],
          departmentIds: [4],
          deptAdminIds: [],
          contactNotes: "",
          statusChangedAt: null,
          statusNote: "",
          userId: null,
          version: 7,
          pendingInvitation: null,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    fireEvent.click(screen.getByText("Send Invitation"));
    expect(screen.getByText("Send invitation?")).toBeInTheDocument();
    confirmDialog("Send Invitation");

    expect(screen.getByText("Account found")).toBeInTheDocument();
    expect(screen.getByText(/Minnie Diaz[\s\S]*matches this staff profile/)).toBeInTheDocument();
    expect(screen.queryByText("Name mismatch found")).not.toBeInTheDocument();
    expect(screen.queryByText("Send invitation?")).not.toBeInTheDocument();

    const invitationMutation = mutationCalls.at(-1);
    invitationMutation?.mutate.mockClear();
    fireEvent.click(screen.getByText("Link Existing Account"));

    expect(invitationMutation?.mutate).toHaveBeenCalledWith({
      action: "create",
      linkExistingAccount: true,
      reconcileName: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Name mismatch found")).toBeInTheDocument();
    });
    expect(screen.getByText(/Minnie Diaz[\s\S]*Link it and update Mina Diaz/)).toBeInTheDocument();

    const nameMismatchInvitationMutation = mutationCalls.at(-1);
    nameMismatchInvitationMutation?.mutate.mockClear();
    fireEvent.click(screen.getByText("Use Account Name"));

    expect(nameMismatchInvitationMutation?.mutate).toHaveBeenCalledWith({
      action: "create",
      linkExistingAccount: true,
      reconcileName: true,
    });
  });

  it("confirms before linking an exact existing account match", () => {
    const mutationCalls: Array<{
      mutate: ReturnType<typeof vi.fn>;
      options: {
        onError?: (error: unknown) => void;
      };
    }> = [];
    const accountFoundError = new ApiResponseError(
      "An existing account was found for this email.",
      409,
      {
        code: "ACCOUNT_FOUND",
        details: {
          employeeId: "emp-1",
          userId: "user-1",
          employeeFirstName: "Mina",
          employeeLastName: "Diaz",
          accountFirstName: "Mina",
          accountLastName: "Diaz",
        },
      },
    );

    useMutation.mockImplementation((options) => {
      const mutate = vi.fn(() => {
        options.onError?.(accountFoundError);
      });
      mutationCalls.push({ mutate, options });
      return {
        error: null,
        isPending: false,
        mutate,
      };
    });
    useQuery.mockReturnValue({
      data: {
        person: {
          id: "emp-1",
          firstName: "Mina",
          lastName: "Diaz",
          employmentType: "full_time",
          phone: "(415) 425-3334",
          email: "mina@dubgrid.com",
          status: "active",
          certificationId: null,
          roleIds: [3],
          seniority: 2,
          focusAreaIds: [2],
          departmentIds: [4],
          deptAdminIds: [],
          contactNotes: "",
          statusChangedAt: null,
          statusNote: "",
          userId: null,
          version: 7,
          pendingInvitation: null,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    fireEvent.click(screen.getByText("Send Invitation"));
    expect(screen.getByText("Send invitation?")).toBeInTheDocument();
    confirmDialog("Send Invitation");

    expect(screen.getByText("Account found")).toBeInTheDocument();
    expect(screen.getByText(/matches this staff profile[\s\S]*new invitation/)).toBeInTheDocument();
    expect(screen.queryByText("Send invitation?")).not.toBeInTheDocument();

    const invitationMutation = mutationCalls.at(-1);
    invitationMutation?.mutate.mockClear();
    fireEvent.click(screen.getByText("Link Existing Account"));

    expect(invitationMutation?.mutate).toHaveBeenCalledWith({
      action: "create",
      linkExistingAccount: true,
      reconcileName: false,
    });
  });
});
