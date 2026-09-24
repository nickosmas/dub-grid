import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";
import {
  navigatedActions,
  pressBack,
  resetNavigationShim,
} from "../../../test/shims/react-navigation-native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const updateMobilePerson = vi.fn();
const updateProfileAccount = vi.fn();
const pushToast = vi.fn();
const routerBack = vi.fn();
const requireMobileCredentialAssurance = vi.fn();
const updateUser = vi.fn();
const stepUpRun = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("expo-router", () => ({
  router: {
    back: routerBack,
  },
}));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    useMutation,
    useQuery,
    useQueryClient: () => ({ invalidateQueries: vi.fn(() => Promise.resolve()) }),
  };
});

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../../../shared/lib/api", () => ({
  createProfileChangeRequest: vi.fn(),
  getProfile: vi.fn(),
  requireMobileCredentialAssurance,
  updateMobilePerson,
  updateProfileAccount,
  updateProfilePhone: vi.fn(),
}));

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      updateUser,
    },
  })),
}));

vi.mock("../hooks/useMobileStepUpAction", () => ({
  useMobileStepUpAction: () => ({ run: stepUpRun, active: false, sheet: null }),
}));

vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

let ProfileWorkScreen: (typeof import("./ProfileWorkScreen"))["default"];

beforeAll(async () => {
  ProfileWorkScreen = (await import("./ProfileWorkScreen")).default;
});

const profileData = {
  user: {
    id: "user-1",
    firstName: "Mina",
    lastName: "Diaz",
    email: "mina@dubgrid.com",
  },
  currentOrg: {
    id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
    name: "DubGrid Health",
    slug: "dubgrid-health",
    labels: {
      focusArea: "Focus Area",
      certification: "Certification",
      role: "Role",
      department: "Department",
    },
  },
  linkedEmployee: {
    id: "d660d308-4e0d-4daf-84fd-6753405e6740",
    firstName: "Mina",
    lastName: "Diaz",
    employmentType: "full_time",
    status: "active",
    phone: "(415) 555-0199",
    email: "mina@dubgrid.com",
    certificationId: null,
    roleIds: [3],
    focusAreaIds: [2],
    departmentIds: [7],
    contactNotes: "",
    version: 4,
    employeeNumber: 87,
  },
  focusAreas: [
    {
      id: 2,
      name: "ICU",
      departmentId: 7,
    },
  ],
  currentMembership: {
    id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
    name: "DubGrid Health",
    slug: "dubgrid-health",
    orgRole: "super_admin",
    platformRole: "none",
    isCurrent: true,
  },
  managementDepartmentIds: [10],
  membershipUpdatedAt: "2026-05-01T00:00:00.000Z",
  pendingProfileChangeRequest: false,
};

describe("ProfileWorkScreen", () => {
  beforeEach(() => {
    resetNavigationShim();
    useMutation.mockReset();
    useQuery.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    updateMobilePerson.mockReset();
    updateProfileAccount.mockReset();
    pushToast.mockReset();
    routerBack.mockReset();
    requireMobileCredentialAssurance.mockReset().mockResolvedValue(undefined);
    updateUser.mockReset().mockResolvedValue({ error: null });
    stepUpRun
      .mockReset()
      .mockImplementation(async (action: (token: string) => Promise<unknown>) => {
        await action("step-up-token");
        return true;
      });

    useAccessToken.mockReturnValue("token-123");
    useQuery.mockReturnValue({
      data: profileData,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    useBootstrap.mockReturnValue({
      data: {
        permissions: {
          canManageEmployees: true,
        },
        focusAreas: profileData.focusAreas,
        departments: [
          { id: 7, name: "Nursing", abbr: "NUR", type: "scheduled" },
          { id: 10, name: "Clinical Leadership", abbr: "CL", type: "management" },
        ],
        certifications: [
          {
            id: 5,
            name: "RN",
            abbr: "RN",
          },
        ],
        roles: [
          {
            id: 3,
            name: "Supervisor",
            abbr: "Supervisor",
          },
        ],
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    useMutation.mockImplementation((options: { mutationFn: (variables?: unknown) => unknown }) => ({
      isPending: false,
      mutate: vi.fn((variables?: unknown) => options.mutationFn(variables)),
      // The screen confirms through `mutateAsync`, so the sheet's latch has a
      // promise to hold and a second confirm can't fire the save again.
      mutateAsync: vi.fn((variables?: unknown) =>
        Promise.resolve().then(() => options.mutationFn(variables)),
      ),
    }));
    updateMobilePerson.mockResolvedValue({
      success: true,
      person: profileData.linkedEmployee,
    });
    updateProfileAccount.mockResolvedValue({ success: true });
  });

  it("opens directly in the persistent account and staff editor", () => {
    render(<ProfileWorkScreen />);

    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Staff profile")).toBeInTheDocument();
    expect(screen.getByText("Employment")).toBeInTheDocument();
    expect(screen.getAllByText("Supervisor").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "RN" })).toBeInTheDocument();
    expect(screen.getByLabelText("Contact notes")).toBeInTheDocument();
    // No Edit/view toggle: the screen opens straight into the editor, with no
    // separate "start editing" step. Its "Cancel" (asserted elsewhere) leaves
    // the screen entirely, unlike PersonDetailScreen's, which exits back to a
    // view mode this screen doesn't have.
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("preserves a dirty draft when the same profile refetches in the background", async () => {
    const view = render(<ProfileWorkScreen />);
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Draft" } });

    useQuery.mockReturnValue({
      data: {
        ...profileData,
        user: { ...profileData.user, firstName: "Server" },
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    view.rerender(<ProfileWorkScreen />);

    await waitFor(() => expect(screen.getByLabelText("First name")).toHaveValue("Draft"));
  });

  // The staff profile a manager opens names both, and reading your own record
  // told you neither: which department your focus areas place you in, or the
  // number an admin will ask you for.
  it("names your departments and staff number alongside the focus areas", () => {
    render(<ProfileWorkScreen />);

    expect(screen.getByText("Department")).toBeInTheDocument();
    expect(screen.getByText("Nursing")).toBeInTheDocument();
    // The kind you manage is a separate row from the kind you're scheduled in,
    // and its label is fixed rather than composed from the org's own noun.
    expect(screen.getByText("Management Departments")).toBeInTheDocument();
    expect(screen.getByText("Clinical Leadership")).toBeInTheDocument();
    expect(screen.getByText("Employee ID")).toBeInTheDocument();
    expect(screen.getByText("#87")).toBeInTheDocument();
  });

  function grantManagementAccessPermission() {
    // Reads the value `beforeEach` installed and layers the permission on it.
    const bootstrap = useBootstrap();
    useBootstrap.mockReturnValue({
      ...bootstrap,
      data: {
        ...bootstrap.data,
        permissions: { ...bootstrap.data.permissions, canManageManagementAccess: true },
      },
    });
  }

  // Web lets a super admin edit their own management departments from their
  // profile; here the row opens the same sheet a manager gets on a teammate,
  // aimed at your own membership, with your current departments checked.
  it("opens the management access sheet from your management row", () => {
    grantManagementAccessPermission();
    render(<ProfileWorkScreen />);

    fireEvent.click(screen.getByRole("button", { name: /^Management Departments/ }));

    expect(screen.getByText("Edit management access")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Clinical Leadership" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("offers Add to management from the row when you manage nothing yet", () => {
    grantManagementAccessPermission();
    useQuery.mockReturnValue({
      data: { ...profileData, managementDepartmentIds: [] },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<ProfileWorkScreen />);

    const row = screen.getByRole("button", { name: /^Management Departments/ });
    expect(row).toHaveTextContent("Not in management");
    fireEvent.click(row);

    expect(screen.getByText("Add to management")).toBeInTheDocument();
  });

  // Without the permission the departments stay a fact, not a control, and
  // someone who manages nothing sees no row at all.
  it("keeps the management row read-only without the permission", () => {
    render(<ProfileWorkScreen />);

    expect(screen.getByText("Clinical Leadership")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Management Departments/ }),
    ).not.toBeInTheDocument();
  });

  // The same allowance the person page makes for a teammate with management
  // access: coming off the schedule is a consequence to announce, not a
  // missing answer to block on.
  it("lets a management user clear their own focus areas, with the notice", async () => {
    render(<ProfileWorkScreen />);

    fireEvent.click(screen.getByRole("checkbox", { name: "ICU" }));

    expect(
      screen.getByText("Saving now removes you from the schedule. You'll keep management access."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Select at least one focus area.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMobilePerson).toHaveBeenCalledWith(
        "token-123",
        "d660d308-4e0d-4daf-84fd-6753405e6740",
        expect.objectContaining({ focusAreaIds: [] }),
      );
    });
  });

  it("still requires a focus area from someone with no management access", () => {
    useQuery.mockReturnValue({
      data: { ...profileData, managementDepartmentIds: [] },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<ProfileWorkScreen />);

    fireEvent.click(screen.getByRole("checkbox", { name: "ICU" }));

    expect(screen.getByText("Select at least one focus area.")).toBeInTheDocument();
    expect(screen.queryByText(/Saving now removes you/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("carries no organization block — that is the profile hub's job", () => {
    render(<ProfileWorkScreen />);

    // This page edits the account and staff record. Which organization that
    // record lives in used to sit above the editable fields, making the first
    // thing on "Profile details" the one thing that isn't a profile detail.
    expect(screen.queryByText("Organization")).not.toBeInTheDocument();
    expect(screen.queryByText("Subdomain")).not.toBeInTheDocument();
  });

  it("keeps Save disabled (but visible) until a field changes, then saves", async () => {
    render(<ProfileWorkScreen />);

    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    // Save is grayed rather than removed, so the footer doesn't reflow the
    // moment the first field changes. Cancel is the only other button: it is
    // always live, because backing out is valid whether or not there is work.
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    // Nothing typed yet, so the dismiss button reads Cancel; it becomes Discard
    // once there is something to throw away.
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "RN" }));

    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.queryByRole("alert")).toBeNull();

    await waitFor(() => {
      expect(updateMobilePerson).toHaveBeenCalledWith(
        "token-123",
        "d660d308-4e0d-4daf-84fd-6753405e6740",
        expect.objectContaining({
          expectedVersion: 4,
          certificationId: 5,
          focusAreaIds: [2],
          roleIds: [3],
          departmentIds: [7],
        }),
      );
    });
  });

  it("explains an email-change request before submitting it", () => {
    render(<ProfileWorkScreen />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const confirmation = screen.getByRole("alert");
    expect(confirmation).toHaveTextContent("Change your sign-in email?");
    expect(confirmation).toHaveTextContent("new@example.com");
    expect(updateMobilePerson).not.toHaveBeenCalled();
    expect(updateProfileAccount).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Email")).toHaveValue("new@example.com");
  });

  it("says a sign-in email change applies to every organization", () => {
    render(<ProfileWorkScreen />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This changes it for every organization you belong to",
    );
  });

  it("confirms identity before writing any part of an email-changing save", async () => {
    const calls: string[] = [];
    requireMobileCredentialAssurance.mockImplementation(async () => {
      calls.push("assurance");
    });
    updateProfileAccount.mockImplementation(async () => {
      calls.push("profile");
      return { success: true };
    });
    updateUser.mockImplementation(async () => {
      calls.push("email");
      return { error: null };
    });

    render(<ProfileWorkScreen />);
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Request changes" }),
    );

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ email: "new@example.com" }));
    expect(stepUpRun).toHaveBeenCalledTimes(1);
    expect(requireMobileCredentialAssurance).toHaveBeenCalledWith("step-up-token");
    expect(calls[0]).toBe("assurance");
  });

  it("writes nothing when the identity check refuses an email change", async () => {
    requireMobileCredentialAssurance.mockRejectedValue(new Error("STEP_UP_REQUIRED"));

    render(<ProfileWorkScreen />);
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Mia" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Request changes" }),
    );

    await waitFor(() => expect(requireMobileCredentialAssurance).toHaveBeenCalled());
    await act(async () => {});
    expect(updateProfileAccount).not.toHaveBeenCalled();
    expect(updateMobilePerson).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("leaves the screen when Cancel is pressed on a clean draft", () => {
    render(<ProfileWorkScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(routerBack).toHaveBeenCalledTimes(1);
  });

  it("swaps Cancel for Discard once edited, and Discard resets without leaving", () => {
    render(<ProfileWorkScreen />);

    fireEvent.click(screen.getByRole("radio", { name: "RN" }));
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    // Reset in place. Leaving with edits in hand is the back gesture's job, so
    // Discard must not navigate.
    expect(routerBack).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("hides an incompatible new role while keeping the selected role removable", () => {
    useBootstrap.mockReturnValue({
      data: {
        permissions: { canManageEmployees: true },
        focusAreas: profileData.focusAreas,
        departments: [],
        certifications: [{ id: 5, name: "Registered Nurse", abbr: "RN" }],
        currentOrg: { useCompactRoleCertificationLabels: true },
        roles: [
          { id: 3, name: "Supervisor", abbr: "SUP", requiredCertificationIds: [5] },
          { id: 4, name: "Clinical Lead", abbr: "CL", requiredCertificationIds: [5] },
        ],
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<ProfileWorkScreen />);

    const selectedRole = screen.getByRole("checkbox", { name: "SUP" });
    expect(selectedRole).not.toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: "CL" })).not.toBeInTheDocument();

    fireEvent.click(selectedRole);
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });

  it("goes back without asking while there is nothing to lose", () => {
    render(<ProfileWorkScreen />);

    // Open but untouched. On iOS the whole screen is a back-swipe target, so a
    // guard that fired here would interrupt an ordinary swipe back.
    act(() => {
      expect(pressBack()).toBe(false);
    });
    expect(navigatedActions).toEqual([{ type: "GO_BACK" }]);
  });

  it("asks before a back press throws away an edit, and leaves once discarded", async () => {
    render(<ProfileWorkScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "RN" }));

    act(() => {
      expect(pressBack()).toBe(true);
    });
    expect(navigatedActions).toHaveLength(0);
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Discard" }));

    // Asserting the action actually lands is the point: `usePreventRemove`
    // reads the render-time flag, so a guard that dispatches before React has
    // committed it vetoes its own exit and the back button silently dies.
    // It lands a beat later now — the exit waits for the confirmation modal to
    // finish leaving, because dismissing both at once is what iOS drops.
    await waitFor(() => {
      expect(navigatedActions).toEqual([{ type: "GO_BACK" }]);
    });
  });

  it("keeps the edit when the back press is called off", () => {
    render(<ProfileWorkScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "RN" }));

    act(() => {
      pressBack();
    });
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Keep Editing" }),
    );

    expect(navigatedActions).toHaveLength(0);
    expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });
});
