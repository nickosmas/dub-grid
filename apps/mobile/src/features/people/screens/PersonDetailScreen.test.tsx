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
const routerReplace = vi.fn();
const routerPush = vi.fn();

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
  router: {
    replace: routerReplace,
    push: routerPush,
  },
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
    routerReplace.mockReset();
    routerPush.mockReset();
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
          // `packages/authz` normalizes view from manage, so a real manager
          // always arrives with both. Mocking manage alone would describe a
          // viewer the server cannot produce.
          canViewEmployeeDetails: true,
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
      employeeNumber: 12,
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

  it("redirects a direct self link without enabling the teammate query", async () => {
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
        focusAreas: [],
        roles: [],
        certifications: [],
        departments: [],
        linkedEmployee: { id: "emp-1" },
        permissions: { canManageEmployees: false },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith("/(tabs)/profile");
    });
    expect(emptyStateTitles).not.toContain("Person not found");
  });

  // The hero states the access tier and nothing else. Status and account chips
  // used to sit under the avatar as well, which made three competing labels out
  // of a heading; both facts are stated further down the page instead.
  it("badges the access tier and leaves the rest of the hero clear", () => {
    useQuery.mockReturnValue({
      data: { person: makePerson() },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.getByText("Super Admin")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText("App access")).not.toBeInTheDocument();
    expect(screen.queryByText("Super Admin Access")).not.toBeInTheDocument();
    expect(screen.queryByText("·")).not.toBeInTheDocument();
  });

  // The avatar's corner used to carry a status dot. The tier's insignia sits
  // beside the name now, and an inactive person reads as inactive from the
  // Activate button rather than from a chip.
  it("crowns a super admin beside their name", () => {
    useQuery.mockReturnValue({
      data: { person: makePerson({ status: "inactive" }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.getByLabelText("Super Admin")).toBeInTheDocument();
    expect(screen.getByText("Activate")).toBeInTheDocument();
  });

  // The page said nothing about management access: the only trace of it was
  // whether the button at the foot read "Add to Management" or "Edit
  // Management Access", and the number an admin identifies someone by was
  // missing entirely. The two kinds of department take a row each — where they
  // are scheduled, and what they manage, are different facts.
  it("names the departments a person manages, and their staff number", () => {
    useQuery.mockReturnValue({
      data: { person: makePerson({ managementDepartmentIds: [4] }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    const scheduled = screen.getByText("Departments");
    const managed = screen.getByText("Management Departments");

    expect(scheduled).toBeInTheDocument();
    expect(managed).toBeInTheDocument();
    // Adjacent rows in Assignments rather than a section of their own, which
    // read as a second Assignments block for anyone who had both.
    expect(scheduled.parentElement?.parentElement?.parentElement).toBe(
      managed.parentElement?.parentElement?.parentElement,
    );
    expect(screen.getByText("Employee ID")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
  });

  // An employee number is a payroll identifier for the person, not a directory
  // fact about them, so it rides on the employee-details permission the way
  // web's ID column and staff detail page both do.
  it("hides a colleague's employee number from a regular user", () => {
    useBootstrap.mockReturnValue({
      data: {
        user: { id: "user-9" },
        currentOrg: {
          labels: {
            focusArea: "Focus Areas",
            role: "Roles",
            certification: "Certification",
            department: "Departments",
          },
        },
        focusAreas: [],
        roles: [],
        certifications: [],
        departments: [],
        permissions: { canManageEmployees: false, canViewEmployeeDetails: false },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: { person: makePerson({}) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.queryByText("Employee ID")).not.toBeInTheDocument();
    expect(screen.queryByText("#12")).not.toBeInTheDocument();
    // The rest of the Staffing section still renders, so this is the one row
    // being withheld rather than the section collapsing.
    expect(screen.getByText("Employment")).toBeInTheDocument();
  });

  // The management label is fixed, never composed from the org's own noun for
  // the other kind: an org that calls its scheduled departments "Scheduled
  // Departments" was reading "Management Scheduled Departments" here.
  it("never builds the management label out of the org's department label", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: {
          labels: {
            focusArea: "Focus Areas",
            role: "Roles",
            certification: "Certification",
            department: "Scheduled Departments",
          },
        },
        focusAreas: [{ id: 2, name: "Skilled Nursing", departmentId: 4 }],
        roles: [{ id: 3, name: "Charge Nurse" }],
        certifications: [],
        departments: [
          { id: 4, name: "North Wing", abbr: "NW", type: "scheduled" },
          { id: 9, name: "Operations", abbr: "OPS", type: "management" },
        ],
        permissions: { canManageEmployees: true },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: { person: makePerson({ managementDepartmentIds: [9] }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.getByText("Scheduled Departments")).toBeInTheDocument();
    expect(screen.getByText("Management Departments")).toBeInTheDocument();
    expect(screen.queryByText("Management Scheduled Departments")).not.toBeInTheDocument();
  });

  // `hasManagementAccess` is true for a plain staff app invitation too, so
  // gating the section on it printed an empty "Management Departments" row for
  // anyone with an invite out.
  it("leaves the management section off for a staff invitation", () => {
    useQuery.mockReturnValue({
      data: {
        person: makePerson({
          userId: null,
          managementDepartmentIds: [],
          pendingInvitation: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "mina@dubgrid.com",
            expiresAt: "2026-09-01T00:00:00.000Z",
            updatedAt: null,
            roleToAssign: "user",
          },
        }),
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.queryByText("Management Departments")).not.toBeInTheDocument();
  });

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
    // The name lives in the native header, so the loaded page is proved by a
    // field the body actually prints.
    expect(screen.getByText("mina@dubgrid.com")).toBeInTheDocument();
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

  // The layout's static "Staff Profile" is a placeholder for a title that is
  // really the person's name, and leaving it up while the rest of the page is
  // a skeleton reads as the page having loaded with that as the name. Nothing
  // here may feed the bar a title while there is no person to name it after.
  // Once one loads, the route gets the person's real title, invisible until
  // the hero starts passing under the native bar.
  it("leaves the header title to the route while loading, then names it after the person", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    });

    const { rerender } = render(<PersonDetailScreen />);

    expect(stackScreenOptions).toEqual([]);

    useQuery.mockReturnValue({
      data: { person: makePerson({ pendingInvitation: null }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    rerender(<PersonDetailScreen />);

    expect(stackScreenOptions).toHaveLength(1);
    expect(stackScreenOptions[0]).toMatchObject({
      headerTitleStyle: { color: "transparent" },
      title: "Mina Diaz",
    });
    expect(screen.getAllByText("Mina Diaz")).toHaveLength(1);
  });

  it("shows the not-found card when the load ends without a person", () => {
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
    expect(stackScreenOptions).toEqual([]);
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
      ["unreadable", null, null],
      "emp-1",
    ]);
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
    // Someone who already has an account gets no invitation banner: the two
    // states worth announcing are the ones a manager can still act on.
    expect(screen.queryByText("App access")).not.toBeInTheDocument();
    expect(screen.queryByText("Invitation pending")).not.toBeInTheDocument();
    expect(screen.queryByText("Active app account")).not.toBeInTheDocument();
    // Each staffing fact is printed exactly once: the hero grid used to preview
    // the sections below it, so the role, the focus areas and the employment
    // type all appeared twice on the way down the page.
    expect(screen.getAllByText("Charge Nurse")).toHaveLength(1);
    expect(screen.getAllByText("Full-time")).toHaveLength(1);
    expect(screen.getAllByText("Skilled Nursing")).toHaveLength(1);
    expect(screen.queryByText("Account access")).not.toBeInTheDocument();
    expect(screen.queryByText("Status updated")).not.toBeInTheDocument();
  });

  it("heads the page with one centered identity block", () => {
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

    // The identity block is the page's heading at rest: initials, the name
    // once, and the tier beside it. The email is not part of it —
    // it keeps its own row in Contact, and printing it here too is what made
    // the old block redundant. The native header carries the same name, but
    // stays invisible until the hero scrolls under it.
    expect(stackScreenOptions).toHaveLength(1);
    expect(stackScreenOptions[0]).toMatchObject({
      headerTitleStyle: { color: "transparent" },
      title: "Mina Diaz",
    });
    const scrollRoot = screen.getByTestId("screen-scroll");
    scrollRoot.dataset.scrollY = "24";
    fireEvent.scroll(scrollRoot);
    expect(stackScreenOptions.at(-1)).toMatchObject({
      headerTitleStyle: { color: expect.not.stringMatching("transparent") },
      title: "Mina Diaz",
    });
    expect(screen.getByText("MD")).toBeInTheDocument();
    expect(screen.getAllByText("Mina Diaz")).toHaveLength(1);
    expect(screen.getAllByText("mina@dubgrid.com")).toHaveLength(1);

    // A plain user gets a badge here too. The People list only badges the
    // tiers worth picking out of a list of names; a page about one person
    // states the tier whatever it is.
    expect(screen.getByText("User")).toBeInTheDocument();
    // Status is not part of the heading any more, only the tier.
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
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
    // Where the account stands is a banner under the actions now, not a chip
    // competing with the name.
    expect(screen.getByText("Invitation pending")).toBeInTheDocument();
    expect(screen.getByText("Sent to mina@dubgrid.com.")).toBeInTheDocument();
  });

  it("banners a person with no account, and tells a manager what to do about it", () => {
    useQuery.mockReturnValue({
      data: { person: makePerson({ pendingInvitation: null, userId: null }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.getByText("No app access")).toBeInTheDocument();
    expect(screen.getByText("Send an invitation to give app access.")).toBeInTheDocument();
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
    // Two buttons, and the dismiss one carries web's tri-state: nothing typed
    // yet, so it reads Cancel. It becomes Discard once there is something to
    // throw away, which the dedicated test below covers.
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.queryByText("Discard")).not.toBeInTheDocument();
    expect(screen.getByText("Save changes")).toBeInTheDocument();
    expect(screen.queryByText("Call")).not.toBeInTheDocument();
    expect(screen.queryByText("Bench")).not.toBeInTheDocument();
  });

  it("swaps Cancel for Discard once edited, and Discard resets without leaving", () => {
    useQuery.mockReturnValue({
      data: { person: makePerson() },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);
    fireEvent.click(screen.getByText("Edit"));

    const firstName = screen.getByDisplayValue("Mina");
    fireEvent.change(firstName, { target: { value: "Minara" } });

    expect(screen.getByText("Discard")).toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Discard"));

    // Reset in place: the field is back to its saved value, the panel is still
    // open, and the button has gone back to Cancel. Leaving is the back
    // gesture's job, which is guarded separately.
    expect(screen.getByDisplayValue("Mina")).toBeInTheDocument();
    expect(screen.getByText("Basic info")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.queryByText("Discard")).not.toBeInTheDocument();
  });

  it("hides an incompatible role while keeping a selected legacy role removable", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: {
          labels: {
            focusArea: "Focus Areas",
            role: "Roles",
            certification: "Certification",
            department: "Departments",
          },
          useCompactRoleCertificationLabels: true,
        },
        focusAreas: [{ id: 2, name: "Skilled Nursing", departmentId: 4 }],
        roles: [
          { id: 3, name: "Charge Nurse", abbr: "CN", requiredCertificationIds: [] },
          { id: 4, name: "Clinical Lead", abbr: "CL", requiredCertificationIds: [5] },
        ],
        certifications: [{ id: 5, name: "Registered Nurse", abbr: "RN" }],
        departments: [{ id: 4, name: "North Wing" }],
        permissions: { canManageEmployees: true },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: { person: makePerson({ certificationId: null, roleIds: [3] }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);
    fireEvent.click(screen.getByText("Edit"));

    expect(screen.getByRole("button", { name: "CN" })).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: "CL" })).not.toBeInTheDocument();
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

    expect(await screen.findByText("Account found")).toBeInTheDocument();
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

  it("confirms before linking an exact existing account match", async () => {
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

    expect(await screen.findByText("Account found")).toBeInTheDocument();
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
      expect(screen.queryByRole("button", { name: "Mark inactive" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    });

    it("marks inactive when the sheet's default outcome is confirmed", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      expect(screen.getByText("Deactivate Mina Diaz?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Mark inactive" }));

      expect(mutate.mock.calls[0]?.[0]).toEqual({
        action: "deactivate",
        expectedVersion: 7,
        note: undefined,
      });
    });

    it("removes from staff when that outcome is picked instead", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      expect(screen.queryByRole("alert")).toBeNull();
      const sheet = screen;
      fireEvent.click(sheet.getByRole("button", { name: /Remove from staff/ }));

      // The primary action's verb follows the outcome, so the confirm always
      // says what it is about to do.
      expect(sheet.queryByRole("button", { name: "Mark inactive" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));

      expect(mutate.mock.calls[0]?.[0]).toEqual({
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
      fireEvent.click(screen.getByRole("button", { name: "Mark inactive" }));

      expect(mutate.mock.calls[0]?.[0]).toEqual({
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
            { id: 10, name: "Facilities", abbr: "FAC", type: "management" },
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

    // Management settings always open in a popup over whatever raised them,
    // never as a page of their own. The form's own behaviour is covered in
    // ManagementAccessSheet's tests.
    it("opens management access in a sheet, not a pushed screen", () => {
      renderWithManagementAccess({});

      fireEvent.click(screen.getByRole("button", { name: "Add to Management" }));

      expect(screen.getByText("Add to management")).toBeInTheDocument();
      expect(routerPush).not.toHaveBeenCalled();
    });

    it("offers only the org's management departments, never its scheduled ones", () => {
      renderWithManagementAccess({});

      fireEvent.click(screen.getByRole("button", { name: "Add to Management" }));

      expect(screen.getByText("OPS")).toBeInTheDocument();
      expect(screen.queryByText("NW")).not.toBeInTheDocument();
    });

    // A plain app invitation carries no management departments, so it must not
    // read as management access the person was never granted.
    it("offers Add to Management to someone holding only a staff invitation", () => {
      renderWithManagementAccess({
        person: {
          pendingInvitation: {
            id: "invite-1",
            email: "mina@dubgrid.com",
            expiresAt: "2099-05-01T00:00:00.000Z",
            updatedAt: "2026-04-28T00:00:00.000Z",
            roleToAssign: "user",
          },
        },
      });

      expect(screen.getByRole("button", { name: "Add to Management" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit Management Access" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("app access badge", () => {
    function renderWithAccessBadge(options: {
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
          departments: [{ id: 9, name: "Operations", abbr: "OPS", type: "management" }],
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
        data: { person: makePerson(options.person) },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      });

      render(<PersonDetailScreen />);
      return mutationCalls;
    }

    const badge = () => screen.getByLabelText(/^App access: /);

    it("makes the badge a control for a linked member", () => {
      renderWithAccessBadge({
        person: { orgRole: "user", membershipUpdatedAt: "2026-01-01T00:00:00.000Z" },
      });

      expect(badge()).toHaveAttribute("aria-label", "App access: User");
      fireEvent.click(badge());
      expect(screen.getByText("Access level")).toBeInTheDocument();
    });

    // Nothing carries a role for someone with neither an account nor an invite,
    // so there is nothing for the picker to write. Web prints a dash here.
    it("leaves the badge static, and says why, with no account and no invitation", () => {
      renderWithAccessBadge({ person: { orgRole: null, userId: null } });

      // A static badge is a plain label, not a button, so it carries no
      // accessible name of its own.
      expect(screen.queryByLabelText(/^App access: /)).not.toBeInTheDocument();
      expect(screen.getByText("User")).toBeInTheDocument();
      expect(screen.getByText("Send an invitation to give app access.")).toBeInTheDocument();
    });

    it("keeps the badge static without the permission", () => {
      renderWithAccessBadge({
        canManageManagementAccess: false,
        person: { orgRole: "user", membershipUpdatedAt: "2026-01-01T00:00:00.000Z" },
      });

      expect(screen.queryByLabelText(/^App access: /)).not.toBeInTheDocument();
      expect(screen.getByText("User")).toBeInTheDocument();
    });

    // The invitation's `roleToAssign` is the role until it is accepted; reading
    // `orgRole` alone showed a pending Admin as "User".
    it("badges a pending invitation with the role it will grant", () => {
      renderWithAccessBadge({
        person: {
          orgRole: null,
          userId: null,
          pendingInvitation: {
            id: "inv-1",
            email: "mina@dubgrid.com",
            expiresAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            roleToAssign: "admin",
          },
        },
      });

      expect(badge()).toHaveAttribute("aria-label", "App access: Admin");
    });

    it("sends the picked role once the change is confirmed", () => {
      const mutationCalls = renderWithAccessBadge({
        person: { orgRole: "user", membershipUpdatedAt: "2026-01-01T00:00:00.000Z" },
      });

      fireEvent.click(badge());
      fireEvent.click(screen.getByRole("button", { name: /^Admin/ }));
      confirmDialog("Change role");

      expect(allMutatePayloads(mutationCalls)).toContain("admin");
    });

    it("asks about revoking and resending when the role lives on an invitation", () => {
      renderWithAccessBadge({
        person: {
          orgRole: null,
          userId: null,
          pendingInvitation: {
            id: "inv-1",
            email: "mina@dubgrid.com",
            expiresAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            roleToAssign: "user",
          },
        },
      });

      fireEvent.click(badge());
      fireEvent.click(screen.getByRole("button", { name: /^Admin/ }));

      expect(screen.getByText("Replace invitation access?")).toBeInTheDocument();
    });
  });

  describe("schedule membership", () => {
    function renderForSchedule(person: Record<string, unknown>) {
      // `mutateAsync` as well as `mutate`: the edit panel's save awaits the
      // promise, so a mock carrying only `mutate` makes a save look like a
      // no-op rather than a failure.
      const mutationCalls: Array<{
        mutate: ReturnType<typeof vi.fn>;
        mutateAsync: ReturnType<typeof vi.fn>;
      }> = [];
      useMutation.mockImplementation(() => {
        const mutate = vi.fn();
        const mutateAsync = vi.fn().mockResolvedValue(undefined);
        mutationCalls.push({ mutate, mutateAsync });
        return { error: null, isPending: false, mutate, mutateAsync };
      });
      useQuery.mockReturnValue({
        data: { person: makePerson(person) },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      });

      render(<PersonDetailScreen />);
      return mutationCalls;
    }

    // Deselecting the focus areas is the removal path; there is no separate
    // button. The server allows the empty set only because they keep managing,
    // so Save has to stay live once the last chip comes off.
    it("clears the focus areas and keeps Save available", () => {
      renderForSchedule({ managementDepartmentIds: [9] });

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Skilled Nursing" }));

      expect(
        screen.getByText(
          "Saving now removes them from the schedule. They'll keep management access.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
    });

    // The notice above the chips already says what saving does, so saving goes
    // straight through. A confirmation here as well warned twice for one action.
    it("saves an emptied schedule without a second confirmation", () => {
      const mutationCalls = renderForSchedule({ managementDepartmentIds: [9] });

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Skilled Nursing" }));
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        mutationCalls.flatMap((call) => call.mutateAsync.mock.calls.map(([payload]) => payload)),
      ).toContainEqual(expect.objectContaining({ focusAreaIds: [] }));
    });

    // Without management access the focus areas are the whole staff record, so
    // clearing them is a validation error, not a removal. Deactivate is what
    // takes plain staff off the grid.
    it("withholds the removal note from plain staff", () => {
      renderForSchedule({ managementDepartmentIds: [] });

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Skilled Nursing" }));

      expect(
        screen.queryByText(
          "Saving now removes them from the schedule. They'll keep management access.",
        ),
      ).not.toBeInTheDocument();
    });

    it("offers Add to Schedule to someone who isn't on it", () => {
      renderForSchedule({ focusAreaIds: [], managementDepartmentIds: [9] });

      expect(screen.getByRole("button", { name: "Add to Schedule" })).toBeInTheDocument();
    });

    it("withholds Add to Schedule from someone already on it", () => {
      renderForSchedule({ focusAreaIds: [2] });

      expect(screen.queryByRole("button", { name: "Add to Schedule" })).not.toBeInTheDocument();
    });

    it("opens the add-to-schedule screen rather than stacking a sheet", () => {
      renderForSchedule({ focusAreaIds: [], managementDepartmentIds: [9] });

      fireEvent.click(screen.getByRole("button", { name: "Add to Schedule" }));

      expect(routerPush).toHaveBeenCalledWith({
        pathname: "/person/[id]/schedule",
        params: { id: "emp-1" },
      });
    });
  });
});
