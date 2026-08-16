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
// Every options object the screen hands the native header, in render order.
const stackScreenOptions: { title?: string }[] = [];
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
    Screen: (props: { options?: { title?: string } }) => {
      stackScreenOptions.push(props.options ?? {});
      return null;
    },
  },
  useLocalSearchParams,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

// Recorded rather than only queried, so a state that renders for a single
// frame and is then corrected still shows up: `screen` only ever sees the
// final DOM, but every render that reached the commit phase lands here.
const emptyStateTitles: string[] = [];

vi.mock("../../../shared/components/EmptyStateCard", () => ({
  EmptyStateCard: ({ title, body }: { title: string; body?: string }) => {
    emptyStateTitles.push(title);
    return (
      <div>
        {title}
        {body}
      </div>
    );
  },
}));

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

/**
 * Every payload passed to any of the screen's mutations. The screen declares
 * several `useMutation`s, and asserting against one by its position in that
 * list broke the moment another was added — which one fired is what matters,
 * and the payload already identifies it.
 */
function allMutatePayloads(calls: Array<{ mutate: ReturnType<typeof vi.fn> }>) {
  return calls.flatMap((call) => call.mutate.mock.calls.map(([payload]) => payload));
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
    emptyStateTitles.length = 0;
    stackScreenOptions.length = 0;

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

  function makePerson(overrides: Record<string, unknown> = {}) {
    return {
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
      managementDepartmentIds: [],
      managementDeptAdminIds: [],
      contactNotes: "Weekend availability",
      statusChangedAt: null,
      statusNote: "",
      userId: "user-1",
      version: 7,
      membershipUpdatedAt: null,
      pendingInvitation: null,
      ...overrides,
    };
  }

  // The edit draft used to be synced from the person in an effect, and effects
  // run after the paint — so the frame where the person first arrived still had
  // a null draft and rendered the not-found card before correcting itself.
  it("never paints the not-found card on the frame the person arrives", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    });

    const { rerender } = render(<PersonDetailScreen />);

    useQuery.mockReturnValue({
      data: { person: makePerson({ pendingInvitation: null }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    rerender(<PersonDetailScreen />);

    expect(emptyStateTitles).not.toContain("Person not found");
    expect(screen.getAllByText("Mina Diaz").length).toBeGreaterThan(0);
  });

  // `person` is gated on canManageEmployees, which comes from bootstrap. With
  // only the person query resolved, an inactive teammate reads as null and the
  // screen declared them missing until bootstrap landed.
  it("waits for bootstrap before deciding a person is missing", () => {
    useBootstrap.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: { person: makePerson({ status: "inactive", pendingInvitation: null }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(emptyStateTitles).not.toContain("Person not found");
  });

  // The layout's static "Person" is a placeholder for a title that is really
  // the person's name, and leaving it up while the rest of the page is a
  // skeleton reads as the page having loaded with that as the name.
  it("leaves the header title empty while the person loads", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    });

    const { rerender } = render(<PersonDetailScreen />);

    expect(stackScreenOptions).toEqual([{ title: "" }]);

    useQuery.mockReturnValue({
      data: { person: makePerson({ pendingInvitation: null }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    rerender(<PersonDetailScreen />);

    expect(stackScreenOptions).toEqual([{ title: "" }, { title: "Mina Diaz" }]);
  });

  // The empty title above is set with `setOptions` and nothing reverts it, so a
  // load that ends without a person has to name the header itself.
  it("names the header again when the person turns out to be missing", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    });

    const { rerender } = render(<PersonDetailScreen />);

    useQuery.mockReturnValue({
      data: { person: null },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    rerender(<PersonDetailScreen />);

    expect(emptyStateTitles).toContain("Person not found");
    expect(stackScreenOptions.at(-1)).toEqual({ title: "Person" });
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
          managementDepartmentIds: [],
          managementDeptAdminIds: [],
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

  // The name belongs to the native header, which collapses it on its own. The
  // page must not print it again, but the avatar and badge stay: they are page
  // content, and scroll away like the rest of it.
  it("names the native header after the person and does not repeat it", () => {
    useQuery.mockReturnValue({
      data: {
        person: {
          id: "emp-1",
          firstName: "Mina",
          lastName: "Diaz",
          orgRole: "user",
          employmentType: "full_time",
          phone: "",
          email: "mina@dubgrid.com",
          status: "active",
          certificationId: null,
          roleIds: [],
          seniority: 2,
          focusAreaIds: [2],
          departmentIds: [4],
          deptAdminIds: [],
          managementDepartmentIds: [],
          managementDeptAdminIds: [],
          contactNotes: "",
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

    // The name belongs to the native header, which collapses it on its own, and
    // nothing under it restates the identity: no avatar, no status badge, no
    // email line. The email keeps its own row in Contact.
    expect(stackScreenOptions).toEqual([{ title: "Mina Diaz" }]);
    expect(screen.queryByText("MD")).not.toBeInTheDocument();
    expect(screen.getAllByText("Mina Diaz")).toHaveLength(1);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getAllByText("mina@dubgrid.com")).toHaveLength(1);

    // The org role had no home but the badge, so removing that badge would have
    // taken the permission tier off the page with it. This fixture is a plain
    // user, whose tier never had a badge at all — it showed the status instead.
    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
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
          managementDepartmentIds: [],
          managementDeptAdminIds: [],
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
          managementDepartmentIds: [],
          managementDeptAdminIds: [],
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
          managementDepartmentIds: [],
          managementDeptAdminIds: [],
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

    for (const call of mutationCalls) call.mutate.mockClear();
    fireEvent.click(screen.getByText("Link Existing Account"));

    expect(allMutatePayloads(mutationCalls)).toContainEqual({
      action: "create",
      linkExistingAccount: true,
      reconcileName: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Name mismatch found")).toBeInTheDocument();
    });
    expect(screen.getByText(/Minnie Diaz[\s\S]*Link it and update Mina Diaz/)).toBeInTheDocument();

    for (const call of mutationCalls) call.mutate.mockClear();
    fireEvent.click(screen.getByText("Use Account Name"));

    expect(allMutatePayloads(mutationCalls)).toContainEqual({
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
          managementDepartmentIds: [],
          managementDeptAdminIds: [],
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

    for (const call of mutationCalls) call.mutate.mockClear();
    fireEvent.click(screen.getByText("Link Existing Account"));

    expect(allMutatePayloads(mutationCalls)).toContainEqual({
      action: "create",
      linkExistingAccount: true,
      reconcileName: false,
    });
  });

  describe("deactivating", () => {
    // One shared spy across all three useMutation calls is enough: only the
    // status confirm fires a mutate in these tests.
    function renderWithStatusMutation(person: Record<string, unknown> = {}) {
      const mutate = vi.fn();
      useMutation.mockReturnValue({
        error: null,
        isPending: false,
        mutate,
      });
      useQuery.mockReturnValue({
        data: { person: makePerson(person) },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      });

      render(<PersonDetailScreen />);
      return mutate;
    }

    it("spends one button on deactivating an active person, not two", () => {
      renderWithStatusMutation();

      expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mark Inactive" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    });

    it("marks inactive when the sheet's default outcome is confirmed", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      expect(screen.getByText("Deactivate Mina Diaz?")).toBeInTheDocument();
      confirmDialog("Mark Inactive");

      expect(mutate).toHaveBeenCalledWith({
        action: "deactivate",
        expectedVersion: 7,
        note: undefined,
      });
    });

    it("removes from staff when that outcome is picked instead", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      const sheet = within(screen.getByRole("alert"));
      fireEvent.click(sheet.getByRole("button", { name: /Remove from staff/ }));

      // The primary action's verb follows the outcome, so the confirm always
      // says what it is about to do.
      expect(sheet.queryByRole("button", { name: "Mark Inactive" })).not.toBeInTheDocument();
      confirmDialog("Remove");

      expect(mutate).toHaveBeenCalledWith({
        action: "remove",
        expectedVersion: 7,
        note: undefined,
      });
    });

    it("carries the reason through with the chosen outcome", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      fireEvent.change(screen.getByPlaceholderText(/Reason \(optional\)/), {
        target: { value: "  On leave until June  " },
      });
      confirmDialog("Mark Inactive");

      expect(mutate).toHaveBeenCalledWith({
        action: "deactivate",
        expectedVersion: 7,
        note: "On leave until June",
      });
    });

    it("keeps Remove reachable once someone is already inactive", () => {
      renderWithStatusMutation({ status: "inactive" });

      expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    });

    it("offers no way back out of removed but reactivating", () => {
      renderWithStatusMutation({ status: "removed" });

      expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    });
  });

  describe("management access", () => {
    function renderWithManagementAccess(options: {
      canManageManagementAccess?: boolean;
      person?: Record<string, unknown>;
    }) {
      const mutationCalls: Array<{ mutate: ReturnType<typeof vi.fn> }> = [];
      useMutation.mockImplementation(() => {
        const mutate = vi.fn();
        mutationCalls.push({ mutate });
        return { error: null, isPending: false, mutate };
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
          departments: [
            { id: 4, name: "North Wing", abbr: "NW", type: "scheduled" },
            { id: 9, name: "Operations", abbr: "OPS", type: "management" },
          ],
          permissions: {
            canManageEmployees: true,
            canManageManagementAccess: options.canManageManagementAccess ?? true,
          },
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      } as never);
      useQuery.mockReturnValue({
        data: { person: makePerson({ userId: null, ...options.person }) },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      });

      render(<PersonDetailScreen />);
      return mutationCalls;
    }

    it("keeps management access out of reach without the permission", () => {
      renderWithManagementAccess({ canManageManagementAccess: false });

      expect(screen.queryByRole("button", { name: "Add to Management" })).not.toBeInTheDocument();
    });

    it("names the action for whether they are already on the roster", () => {
      renderWithManagementAccess({});
      expect(screen.getByRole("button", { name: "Add to Management" })).toBeInTheDocument();

      renderWithManagementAccess({ person: { managementDepartmentIds: [9] } });
      expect(screen.getByRole("button", { name: "Edit Management Access" })).toBeInTheDocument();
    });

    it("offers only the org's management departments, never its scheduled ones", () => {
      renderWithManagementAccess({});

      fireEvent.click(screen.getByRole("button", { name: "Add to Management" }));

      expect(screen.getByText("OPS")).toBeInTheDocument();
      expect(screen.queryByText("NW")).not.toBeInTheDocument();
    });

    it("sends the picked departments, defaulting a fresh grant to User", () => {
      const mutationCalls = renderWithManagementAccess({ person: { orgRole: null } });

      fireEvent.click(screen.getByRole("button", { name: "Add to Management" }));
      fireEvent.click(screen.getByText("OPS"));
      fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

      expect(allMutatePayloads(mutationCalls)).toContainEqual({
        draft: { orgRole: "user", managementDepartmentIds: [9] },
      });
    });

    it("opens on the role they already hold rather than resetting it", () => {
      const mutationCalls = renderWithManagementAccess({
        person: { orgRole: "admin", managementDepartmentIds: [9] },
      });

      fireEvent.click(screen.getByRole("button", { name: "Edit Management Access" }));
      fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

      expect(allMutatePayloads(mutationCalls)).toContainEqual({
        draft: { orgRole: "admin", managementDepartmentIds: [9] },
      });
    });

    it("refuses to submit with no department selected", () => {
      const mutationCalls = renderWithManagementAccess({});

      fireEvent.click(screen.getByRole("button", { name: "Add to Management" }));
      fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

      expect(allMutatePayloads(mutationCalls)).toHaveLength(0);
    });
  });
});
