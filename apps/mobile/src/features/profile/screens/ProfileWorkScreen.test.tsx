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

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

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
  updateMobilePerson,
  updateProfileAccount,
  updateProfilePhone: vi.fn(),
}));

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
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
  managementDepartmentIds: [10],
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
    useMutation.mockImplementation((options: { mutationFn: () => unknown }) => ({
      isPending: false,
      mutate: vi.fn(() => options.mutationFn()),
      // The screen confirms through `mutateAsync`, so the sheet's latch has a
      // promise to hold and a second confirm can't fire the save again.
      mutateAsync: vi.fn(() => Promise.resolve(options.mutationFn())),
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
    expect(screen.getByRole("button", { name: "RN" })).toBeInTheDocument();
    expect(screen.getByLabelText("Contact notes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
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

  it("carries no organization block — that is the profile hub's job", () => {
    render(<ProfileWorkScreen />);

    // This page edits the account and staff record. Which organization that
    // record lives in used to sit above the editable fields, making the first
    // thing on "Profile details" the one thing that isn't a profile detail.
    expect(screen.queryByText("Organization")).not.toBeInTheDocument();
    expect(screen.queryByText("Subdomain")).not.toBeInTheDocument();
  });

  it("keeps Save disabled and hides Discard until a field changes, then saves", async () => {
    render(<ProfileWorkScreen />);

    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "RN" }));

    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Save these changes?")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Save" }));

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

    const selectedRole = screen.getByRole("button", { name: "SUP" });
    expect(selectedRole).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: "CL" })).not.toBeInTheDocument();

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
    fireEvent.click(screen.getByRole("button", { name: "RN" }));

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
    fireEvent.click(screen.getByRole("button", { name: "RN" }));

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
