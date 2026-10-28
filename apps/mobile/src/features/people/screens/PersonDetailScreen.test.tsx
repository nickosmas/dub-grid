import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiResponseError } from "@dubgrid/api-client";
import { formatReturnDate } from "@dubgrid/domain";
import { addDaysToIsoDate, getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const useLocalSearchParams = vi.fn();
// Every options object the screen hands the native header, in render order.
const stackScreenOptions: StackScreenOptions[] = [];

type StackScreenOptions = {
  title?: string;
  headerRight?: () => ReactNode;
};
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
    // The bar's trailing slot rendered in place, so a test can press the
    // header's "Edit" the way it presses anything else on the page.
    Screen: (props: { options?: StackScreenOptions }) => {
      stackScreenOptions.push(props.options ?? {});
      return <div data-testid="navigation-bar">{props.options?.headerRight?.() ?? null}</div>;
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

const stepUpRun = vi.fn(async (action: (token: string) => Promise<unknown>) => {
  await action("step-up-token");
  return true;
});
const requireMobileCredentialAssurance = vi.fn(async (_accessToken: string) => ({
  success: true,
}));

vi.mock("../../profile/hooks/useMobileStepUpAction", () => ({
  useMobileStepUpAction: () => ({ run: stepUpRun, active: false, sheet: null }),
}));

const updateMobilePerson = vi.fn();

vi.mock("../../../shared/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/lib/api")>()),
  updateMobilePerson: (...args: unknown[]) => updateMobilePerson(...args),
  requireMobileCredentialAssurance: (accessToken: string) =>
    requireMobileCredentialAssurance(accessToken),
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
    stepUpRun.mockClear();
    requireMobileCredentialAssurance.mockClear();
    emptyStateTitles.length = 0;
    stackScreenOptions.length = 0;

    useAccessToken.mockReturnValue("token-123");
    useLocalSearchParams.mockReturnValue({
      id: "emp-1",
    });
    useBootstrap.mockReturnValue({
      data: {
        effectiveRole: "super_admin",
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
        absenceTypes: [
          { id: 134, label: "V", name: "Vacation" },
          { id: 135, label: "S", name: "Sick" },
        ],
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

  // The hero is the name and the tier's insignia beside it, nothing else. A
  // pill spelling the tier out used to sit under the avatar, and status and
  // account chips before that; each made a second heading out of a fact the
  // page states elsewhere.
  it("marks the tier with the insignia alone and leaves the rest of the hero clear", () => {
    useQuery.mockReturnValue({
      data: { person: makePerson() },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.getByLabelText("Super Admin")).toBeInTheDocument();
    expect(screen.queryByText("Super Admin")).not.toBeInTheDocument();
    // The status is the card under the contact pair, not a pill in the hero.
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(within(screen.getByTestId("status-card")).getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("App access")).not.toBeInTheDocument();
    expect(screen.queryByText("Super Admin Access")).not.toBeInTheDocument();
    expect(screen.queryByText("·")).not.toBeInTheDocument();
  });

  it("shows a new hire's first day on a dashed card and the record (51g4)", () => {
    const firstDay = addDaysToIsoDate(getIsoDateInTimeZone(new Date(), null), 12);
    useQuery.mockReturnValue({
      data: { person: makePerson({ firstDay }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    const card = within(screen.getByTestId("starts-card"));
    expect(card.getByText("First day")).toBeInTheDocument();
    expect(
      card.getByText(`Starts ${formatReturnDate(firstDay, { weekday: true })}`),
    ).toBeInTheDocument();
    expect(card.getByText("Can't be scheduled before then.")).toBeInTheDocument();
    expect(screen.getByLabelText(`Starts ${formatReturnDate(firstDay)}`)).toBeInTheDocument();
  });

  it("keeps a past first day on the record without the card (51g4)", () => {
    useQuery.mockReturnValue({
      data: { person: makePerson({ firstDay: "2019-03-04" }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.queryByTestId("starts-card")).not.toBeInTheDocument();
    expect(screen.getByText("Mar 4, 2019")).toBeInTheDocument();
  });

  // The avatar's corner used to carry a status dot. The tier's insignia sits
  // beside the name now, and an Away person reads as away from the Mark active
  // button rather than from a chip.
  it("stars a super admin beside their name", () => {
    useQuery.mockReturnValue({
      data: { person: makePerson({ status: "inactive" }) },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.getByLabelText("Super Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark active" })).toBeInTheDocument();
  });

  // The page said nothing about management access: the only trace of it was
  // whether the button at the foot read "Add to management" or "Edit
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
    // Employment is HR information too; the web roster hides that column
    // from regular users. A held certification is a scheduling fact and stays.
    expect(screen.queryByText("Employment")).not.toBeInTheDocument();
    expect(screen.queryByText("Certification")).not.toBeInTheDocument();
    expect(screen.getByText("Assignments")).toBeInTheDocument();
  });

  // The API redacts a colleague's userId, invitation and contact details for a
  // regular viewer, so anything built from them would state a blank as a fact:
  // every colleague read "No app access" with two dead Call and Email buttons.
  it("shows a regular user only directory facts about a colleague", () => {
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
      data: {
        person: makePerson({
          orgRole: "user",
          email: "",
          phone: "",
          userId: null,
          pendingInvitation: null,
        }),
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.queryByText("No app access")).not.toBeInTheDocument();
    expect(screen.queryByText("Invitation pending")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Call" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.queryByText("Contact")).not.toBeInTheDocument();
    expect(screen.queryByText("No email on file")).not.toBeInTheDocument();
    // A plain "User" tier says nothing about a colleague; only an Admin or
    // Super admin insignia would.
    expect(screen.queryByText("User")).not.toBeInTheDocument();
    expect(screen.getByText("Assignments")).toBeInTheDocument();
  });

  it("keeps an Admin insignia visible to a regular user", () => {
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
      data: {
        person: makePerson({ orgRole: "admin", email: "", phone: "", userId: null }),
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PersonDetailScreen />);

    expect(screen.getByLabelText("Admin")).toBeInTheDocument();
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
    expect(screen.getByLabelText("Super Admin")).toBeInTheDocument();
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

    // A plain user gets no insignia and no pill: the tier is stated only
    // where it says something, and "User" says nothing.
    expect(screen.queryByText("User")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("User")).not.toBeInTheDocument();
    // Status is not part of the heading either; Active draws no icon after the name.
    expect(screen.queryByTestId("status-mark")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "Call" })).not.toBeInTheDocument();
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

    expect(screen.getByRole("checkbox", { name: "CN" })).not.toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: "CL" })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(screen.getByText(/^Send an invitation to .+\?$/)).toBeInTheDocument();
    confirmDialog("Send invitation");

    expect(await screen.findByText("Account found")).toBeInTheDocument();
    expect(
      screen.getByText(/^An existing app account matches this staff profile\./),
    ).toBeInTheDocument();
    expect(screen.queryByText("Name mismatch found")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Send an invitation to .+\?$/)).not.toBeInTheDocument();

    for (const call of mutationCalls) call.mutate.mockClear();
    fireEvent.click(screen.getByText("Link existing account"));

    expect(allMutatePayloads(mutationCalls)).toContainEqual({
      action: "create",
      linkExistingAccount: true,
      reconcileName: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Name mismatch found")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "The existing account is under a different name. Linking it updates the staff profile to match the account name.",
      ),
    ).toBeInTheDocument();

    for (const call of mutationCalls) call.mutate.mockClear();
    fireEvent.click(screen.getByText("Use account name"));

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

    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(screen.getByText(/^Send an invitation to .+\?$/)).toBeInTheDocument();
    confirmDialog("Send invitation");

    expect(await screen.findByText("Account found")).toBeInTheDocument();
    expect(
      screen.getByText(
        /matches this staff profile\. You can link it instead of sending a new invitation\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Send an invitation to .+\?$/)).not.toBeInTheDocument();

    for (const call of mutationCalls) call.mutate.mockClear();
    fireEvent.click(screen.getByText("Link existing account"));

    expect(allMutatePayloads(mutationCalls)).toContainEqual({
      action: "create",
      linkExistingAccount: true,
      reconcileName: false,
    });
  });

  describe("Change status", () => {
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

    // No organization timezone in these tests, so the first return date is UTC's tomorrow.
    const day = (offset: number) =>
      addDaysToIsoDate(getIsoDateInTimeZone(new Date(), null), offset);
    const choose = (date: string) =>
      fireEvent.click(
        screen.getByRole("button", {
          name: `Choose ${formatReturnDate(date, { weekday: true })}`,
        }),
      );
    const pick = (name: RegExp) => fireEvent.click(screen.getByRole("radio", { name }));
    const confirm = (label: string) =>
      fireEvent.click(screen.getAllByRole("button", { name: label }).at(-1)!);
    // The card's menu hands over to the status sheet once its own sheet has left.
    const fromMore = async (label: string, sheetTitle: string) => {
      fireEvent.click(screen.getByRole("button", { name: "More status changes" }));
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => expect(screen.getByText(sheetTitle)).toBeInTheDocument());
    };

    it("offers the likely change first, and a menu for the rest", () => {
      for (const [person, buttons] of [
        [{}, ["Change status"]],
        [{ status: "inactive" }, ["Mark active", "More status changes"]],
        [{ suspendedAt: "2026-10-26T12:00:00Z" }, ["Reinstate", "More status changes"]],
        [{ status: "removed" }, ["Restore"]],
      ] as const) {
        renderWithStatusMutation(person);
        const card = within(screen.getByTestId("status-card"));
        expect(
          card
            .getAllByRole("button")
            .map((button) => button.getAttribute("aria-label") ?? button.textContent),
        ).toEqual(buttons);
        for (const old of ["Mark away", "Offboard", "Suspend"]) {
          expect(screen.queryByRole("button", { name: old })).not.toBeInTheDocument();
        }
        cleanup();
      }
    });

    it("lists Suspend disabled for someone with no account", () => {
      renderWithStatusMutation({ userId: null });

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));

      expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(
        [
          "Away. Not scheduled while away.",
          "Suspended. Only someone with an account can be suspended.",
          "Offboarded. No longer on staff. Can't be scheduled.",
        ],
      );
      expect(screen.getByRole("radio", { name: /^Suspended/ })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("names the button for Offboard, the one change left with no account and an away planned (prod bug)", () => {
      renderWithStatusMutation({
        userId: null,
        focusAreaIds: [1],
        plannedStatus: "away",
        plannedFrom: "2026-11-01",
      });

      // Offboard is the one change left, so the card's button is named for it.
      expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Offboard" }));
      expect(screen.getByText("Offboard Mina Diaz?")).toBeInTheDocument();
      expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    });

    it("keeps Change status, with the disabled rows, when two or more changes are left", () => {
      renderWithStatusMutation({ plannedStatus: "away", plannedFrom: "2026-11-01" });

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));

      expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(
        [
          "Away. Planned from Sun, Nov 1. Change it with Edit plan.",
          "Suspended. Can't sign in. Stays on the schedule.",
          "Offboarded. No longer on staff. Can't sign in or be scheduled.",
        ],
      );
      // Nothing is picked for them, and a disabled row can't be.
      pick(/^Away/);
      expect(screen.getByRole("radio", { name: /^Away/ })).toHaveAttribute("aria-checked", "false");
    });

    it("shows no status button when no change is left", () => {
      renderWithStatusMutation({
        userId: null,
        focusAreaIds: [],
        plannedStatus: "removed",
        plannedFrom: day(5),
      });

      expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Offboard" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit plan" })).toBeInTheDocument();
    });

    it("names each other change in a suspended person's menu, each with its own sheet", async () => {
      const mutate = renderWithStatusMutation({ suspendedAt: "2026-10-26T12:00:00Z" });

      fireEvent.click(screen.getByRole("button", { name: "More status changes" }));
      expect(screen.getByRole("button", { name: "Mark away" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Offboard" }));
      await waitFor(() => expect(screen.getByText("Offboard Mina Diaz?")).toBeInTheDocument());
      expect(screen.queryByRole("radio", { name: /^Away/ })).not.toBeInTheDocument();
      confirm("Offboard");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({ copyAction: "archive" });
    });

    it("says where they stand and lists only where they can go", () => {
      renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));

      expect(screen.getByText("Change Mina Diaz's status?")).toBeInTheDocument();
      // The page's card and the sheet's both say it.
      expect(screen.getAllByText("Can sign in and be scheduled.")).toHaveLength(2);
      expect(screen.getByText("Change to")).toBeInTheDocument();
      expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(
        [
          "Away. Keeps sign-in. Not scheduled while away.",
          "Suspended. Can't sign in. Stays on the schedule.",
          "Offboarded. No longer on staff. Can't sign in or be scheduled.",
        ],
      );
    });

    it("lists Offboarded disabled when an Admin looks at a Super Admin (51k)", () => {
      const manager = useBootstrap();
      useBootstrap.mockReturnValue({
        ...manager,
        data: { ...manager.data, effectiveRole: "admin" },
      });
      renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));

      const offboard = screen.getByRole("radio", { name: /^Offboarded/ });
      expect(offboard).toHaveAttribute("aria-disabled", "true");
      expect(offboard).toHaveAccessibleName(
        "Offboarded. Only a Super Admin can offboard a Super Admin.",
      );
    });

    it("names the picked change in the title and keeps what stays apart", () => {
      renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Suspended/);

      expect(screen.getByText("Suspend Mina Diaz?")).toBeInTheDocument();
      expect(screen.getByLabelText("Changes")).toHaveTextContent(
        "Open requests they're part of are closed, and pickups they claimed go back up for others.",
      );
      expect(screen.getByLabelText("Stays the same")).toHaveTextContent(
        "Their shifts stay, and you can keep scheduling them.",
      );
    });

    it("draws the status icon after the name", () => {
      renderWithStatusMutation({ suspendedAt: "2026-10-26T12:00:00Z" });
      expect(
        screen.getByRole("image", { name: "Suspended: won't see this in the app" }),
      ).toBeInTheDocument();
      cleanup();
      renderWithStatusMutation({ status: "inactive", awayUntil: "2027-01-04" });
      expect(screen.getByRole("image", { name: "Away until Mon, Jan 4" })).toBeInTheDocument();
    });

    it("marks someone away with a reason", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Away/);
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  Family leave  " } });
      confirm("Mark away");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "deactivate",
        copyAction: "markAway",
        expectedVersion: 7,
        note: "Family leave",
      });
    });

    it("marks someone away until a day they pick, with an absence", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Away/);
      fireEvent.click(screen.getByRole("button", { name: "Return date, none" }));
      choose(day(1));
      fireEvent.click(screen.getByRole("radio", { name: "Vacation" }));
      expect(
        screen.getByText(
          `Every day until ${formatReturnDate(day(1))} shows Vacation in the draft, in place of any shift.`,
        ),
      ).toBeInTheDocument();
      confirm("Mark away");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "deactivate",
        returnDate: day(1),
        absenceTypeId: 134,
      });
    });

    it("schedules an Away for a later start (51g1)", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Away/);
      fireEvent.click(screen.getByRole("button", { name: "Starts, none" }));
      choose(day(1));
      fireEvent.click(
        screen.getByRole("button", {
          name: `Starts, ${formatReturnDate(day(1), { weekday: true })}`,
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Return date, none" }));
      choose(day(2));
      expect(
        screen.getByText(`They stay Active until ${formatReturnDate(day(1), { weekday: true })}.`),
      ).toBeInTheDocument();
      confirm("Schedule away");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "deactivate",
        copyAction: "markAway",
        startDate: day(1),
        returnDate: day(2),
      });
    });

    it("keeps a planned away's Change status to the list, with Away disabled", () => {
      renderWithStatusMutation({
        plannedStatus: "away",
        plannedFrom: day(5),
        plannedUntil: day(9),
      });

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));

      expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(
        [
          `Away. Planned from ${formatReturnDate(day(5), { weekday: true })}. Change it with Edit plan.`,
          "Suspended. Can't sign in. Stays on the schedule.",
          "Offboarded. No longer on staff. Can't sign in or be scheduled.",
        ],
      );
      expect(screen.queryByRole("button", { name: /^Starts, / })).not.toBeInTheDocument();
    });

    it("starts a planned away today from Edit plan when its start is cleared", () => {
      const mutate = renderWithStatusMutation({
        plannedStatus: "away",
        plannedFrom: day(5),
        plannedUntil: day(9),
      });

      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      expect(screen.queryByRole("radio", { name: /^Suspended/ })).not.toBeInTheDocument();
      expect(screen.getByText("Clear it to start their time away today.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Starts, / }));
      fireEvent.click(screen.getByRole("button", { name: "Today" }));
      expect(screen.getByText("Mark Mina Diaz away?")).toBeInTheDocument();
      confirm("Mark away");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        copyAction: "markAway",
        returnDate: day(9),
        startDate: undefined,
      });
    });

    it("closes a card button's own confirmation, or an untouched plan, without asking to discard", () => {
      renderWithStatusMutation({ suspendedAt: "2026-10-26T12:00:00Z" });
      fireEvent.click(screen.getByRole("button", { name: "Reinstate" }));
      fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
      expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
      expect(screen.queryByText("Reinstate Mina Diaz?")).not.toBeInTheDocument();
      cleanup();

      renderWithStatusMutation({
        plannedStatus: "away",
        plannedFrom: day(5),
        plannedUntil: day(9),
      });
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
      expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
    });

    it("cancels a planned Away (51g1)", () => {
      const mutate = renderWithStatusMutation({
        plannedStatus: "away",
        plannedFrom: day(5),
        plannedUntil: day(9),
      });

      // The planned card's Edit plan opens the same sheet, without the card.
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      expect(
        screen.getAllByText(`Away from ${formatReturnDate(day(5), { weekday: true })}`),
      ).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Cancel planned away" }));
      confirm("Cancel planned away");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "cancelPlannedChange",
        copyAction: "cancelPlannedChange",
      });
    });

    it("suspends until an end date, and schedules a suspension for later (51g3)", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Suspended/);
      fireEvent.click(screen.getByRole("button", { name: "Ends, none" }));
      choose(day(3));
      expect(
        screen.getByText(`They get access back on ${formatReturnDate(day(3), { weekday: true })}.`),
      ).toBeInTheDocument();
      confirm("Suspend");
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "suspend",
        copyAction: "suspend",
        returnDate: day(3),
        startDate: undefined,
      });
      cleanup();

      const later = renderWithStatusMutation();
      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Suspended/);
      fireEvent.click(screen.getByRole("button", { name: "Starts, none" }));
      choose(day(2));
      expect(
        screen.getByText(
          `They keep their access until ${formatReturnDate(day(2), { weekday: true })}.`,
        ),
      ).toBeInTheDocument();
      confirm("Schedule suspension");
      expect(later.mock.calls[0]?.[0]).toMatchObject({
        action: "suspend",
        startDate: day(2),
        returnDate: undefined,
      });
    });

    it("changes a suspended person's end date from the card's menu", async () => {
      const mutate = renderWithStatusMutation({
        suspendedAt: "2026-10-26T12:00:00Z",
        suspendedUntil: day(9),
      });

      expect(
        screen.getByText(`Suspended until ${formatReturnDate(day(9), { weekday: true })}`),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "More status changes" }));
      fireEvent.click(screen.getByRole("button", { name: "Change end date" }));
      await waitFor(() =>
        expect(screen.getByText("Change when Mina Diaz's suspension ends?")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: /^Ends, / }));
      fireEvent.click(screen.getByRole("button", { name: "No end date" }));
      confirm("Save changes");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "setSuspendedUntil",
        copyAction: "setSuspendedUntil",
        returnDate: null,
      });
    });

    it("moves, cancels and starts a planned suspension from Edit plan", () => {
      const planned = {
        plannedStatus: "suspended" as const,
        plannedFrom: day(5),
        plannedUntil: day(9),
      };
      const mutate = renderWithStatusMutation(planned);

      expect(
        screen.getAllByText(`Suspended from ${formatReturnDate(day(5), { weekday: true })}`).length,
      ).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      expect(screen.getByText("Clear it to suspend them today.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Ends, / }));
      choose(day(12));
      confirm("Save changes");
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "setPlannedChange",
        startDate: day(5),
        returnDate: day(12),
        fromPlannedStatus: "suspended",
      });
      cleanup();

      const cancel = renderWithStatusMutation(planned);
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel planned suspension" }));
      confirm("Cancel planned suspension");
      expect(cancel.mock.calls[0]?.[0]).toMatchObject({ action: "cancelPlannedChange" });
      cleanup();

      const now = renderWithStatusMutation(planned);
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      fireEvent.click(screen.getByRole("button", { name: /^Starts, / }));
      fireEvent.click(screen.getByRole("button", { name: "Today" }));
      expect(screen.getByText("Suspend Mina Diaz?")).toBeInTheDocument();
      confirm("Suspend");
      expect(now.mock.calls[0]?.[0]).toMatchObject({
        action: "suspend",
        startDate: undefined,
        returnDate: day(9),
      });
    });

    it("lists Suspended disabled, pointing at Edit plan, while a suspension is planned", () => {
      renderWithStatusMutation({ plannedStatus: "suspended", plannedFrom: day(5) });

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));

      const suspend = screen.getByRole("radio", { name: /^Suspended/ });
      expect(suspend).toHaveAttribute("aria-disabled", "true");
      expect(suspend.getAttribute("aria-label")).toBe(
        `Suspended. Planned from ${formatReturnDate(day(5), { weekday: true })}. Change it with Edit plan.`,
      );
    });

    it("offers Starts and Last day no further than a year ahead", () => {
      renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Offboarded/);
      fireEvent.click(screen.getByRole("button", { name: "Last day, none" }));
      for (let month = 0; month < 12; month++) {
        fireEvent.click(screen.getByRole("button", { name: "Next month" }));
      }

      expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
      expect(
        screen.getByRole("button", {
          name: `Choose ${formatReturnDate(day(366), { weekday: true })}`,
        }),
      ).toBeDisabled();
    });

    it("sets a last day through Offboard (51g2)", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Offboarded/);
      fireEvent.click(screen.getByRole("button", { name: "Last day, none" }));
      choose(day(3));
      expect(
        screen.getByText(
          `They stay Active through ${formatReturnDate(day(3), { weekday: true })}, their last day.`,
        ),
      ).toBeInTheDocument();
      confirm("Set last day");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "remove",
        copyAction: "archive",
        lastDay: day(3),
      });
    });

    it("offboards now when no last day is picked", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Offboarded/);
      confirm("Offboard");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({ action: "remove", lastDay: null });
    });

    it("moves, cancels and clears a last day from Edit plan", () => {
      const leaving = { plannedStatus: "removed" as const, plannedFrom: day(5) };
      const mutate = renderWithStatusMutation(leaving);

      expect(
        screen.getByText(`Leaving ${formatReturnDate(day(4), { weekday: true })}`),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      expect(screen.getByText("Change Mina Diaz's last day?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Last day, / }));
      choose(day(6));
      confirm("Save changes");
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "setPlannedChange",
        copyAction: "setPlannedChange",
        lastDay: day(6),
        startDate: undefined,
        fromPlannedStatus: "removed",
      });
      cleanup();

      const cancel = renderWithStatusMutation(leaving);
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel last day" }));
      confirm("Cancel last day");
      expect(cancel.mock.calls[0]?.[0]).toMatchObject({ action: "cancelPlannedChange" });
      cleanup();

      const now = renderWithStatusMutation(leaving);
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      fireEvent.click(screen.getByRole("button", { name: /^Last day, / }));
      fireEvent.click(screen.getByRole("button", { name: "Offboard now" }));
      expect(screen.getByText("Offboard Mina Diaz?")).toBeInTheDocument();
      confirm("Offboard");
      expect(now.mock.calls[0]?.[0]).toMatchObject({ action: "remove", lastDay: undefined });
    });

    it("lists Offboard disabled while a last day is planned", () => {
      renderWithStatusMutation({ plannedStatus: "removed", plannedFrom: day(5) });

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));

      expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(
        [
          "Away. Keeps sign-in. Not scheduled while away.",
          "Suspended. Can't sign in. Stays on the schedule.",
          `Offboarded. Leaving ${formatReturnDate(day(4), { weekday: true })}. Change it with Edit plan.`,
        ],
      );
      pick(/^Suspended/);
      expect(screen.getByLabelText("Changes")).toHaveTextContent(
        `The last day planned for ${formatReturnDate(day(4))} is cancelled.`,
      );
    });

    it("never offers today as a return date", () => {
      renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Away/);
      fireEvent.click(screen.getByRole("button", { name: "Return date, none" }));

      expect(
        screen.getByRole("button", {
          name: `Choose ${formatReturnDate(day(0), { weekday: true })}`,
        }),
      ).toBeDisabled();
    });

    it("archives with a reason", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Offboarded/);
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Left" } });
      confirm("Offboard");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({ action: "remove", note: "Left" });
    });

    it("suspends, saying what that does", () => {
      const mutate = renderWithStatusMutation();

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));
      pick(/^Suspended/);
      expect(
        screen.getByText("They're signed out on every device and can't sign in."),
      ).toBeInTheDocument();
      confirm("Suspend");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({ action: "suspend" });
    });

    it("lists Away disabled for someone who isn't on the schedule", () => {
      renderWithStatusMutation({ focusAreaIds: [] });

      fireEvent.click(screen.getByRole("button", { name: "Change status" }));

      expect(screen.getByRole("radio", { name: /^Away/ })).toHaveAttribute(
        "aria-label",
        "Away. Only someone on the schedule can be marked away.",
      );
      expect(screen.getByRole("radio", { name: /^Away/ })).toHaveAttribute("aria-disabled", "true");
    });

    it("brings an Away person back with Mark active", () => {
      const mutate = renderWithStatusMutation({ status: "inactive" });

      // The card's Mark active opens a confirmation for it alone.
      fireEvent.click(screen.getByRole("button", { name: "Mark active" }));
      expect(screen.queryByRole("radio")).not.toBeInTheDocument();
      expect(screen.getByText("Mark Mina Diaz active?")).toBeInTheDocument();
      confirm("Mark active");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "activate",
        copyAction: "markActive",
      });
    });

    it("changes an Away person's return date from the menu, as Save changes", async () => {
      const mutate = renderWithStatusMutation({ status: "inactive", awayUntil: day(1) });

      await fromMore("Change return date", "Change Mina Diaz's return date?");
      expect(screen.queryByRole("radio", { name: /^Offboarded/ })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Save changes" }).at(-1)).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: /^Return date, / }));
      choose(day(2));
      confirm("Save changes");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "setReturnDate",
        returnDate: day(2),
        fromReturnDate: day(1),
      });
    });

    it("changes only the absence on an Away person's days", async () => {
      const mutate = renderWithStatusMutation({
        status: "inactive",
        awayUntil: day(2),
        awayAbsenceTypeId: 134,
      });

      await fromMore("Change return date", "Change Mina Diaz's return date?");
      fireEvent.click(screen.getByRole("radio", { name: "Sick" }));
      confirm("Save changes");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "setReturnDate",
        returnDate: day(2),
        absenceTypeId: 135,
      });
    });

    it("reinstates a suspended person", () => {
      const mutate = renderWithStatusMutation({ suspendedAt: "2026-10-26T12:00:00Z" });

      fireEvent.click(screen.getByRole("button", { name: "Reinstate" }));
      expect(screen.getAllByText("Suspended since Oct 26")).toHaveLength(1);
      expect(
        screen.getByText("They'll be Active again and can sign in on the web and in the app."),
      ).toBeInTheDocument();
      confirm("Reinstate");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({ action: "reinstate", expectedVersion: 7 });
    });

    it("restores an archived person", () => {
      const mutate = renderWithStatusMutation({ status: "removed" });

      fireEvent.click(screen.getByRole("button", { name: "Restore" }));
      // Restore is the only way on: no list to pick from, a sentence instead.
      expect(screen.queryByRole("radio")).not.toBeInTheDocument();
      expect(
        screen.getByText(
          "They'll be Active again: back on staff, and they can sign in and be scheduled.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Restore Mina Diaz?")).toBeInTheDocument();
      confirm("Restore");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "activate",
        copyAction: "restore",
      });
    });

    it("restores on a later date (51l)", () => {
      const mutate = renderWithStatusMutation({ status: "removed" });

      fireEvent.click(screen.getByRole("button", { name: "Restore" }));
      expect(screen.getByText("Leave it empty to restore them today.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Starts, none" }));
      choose(day(3));
      expect(
        screen.getByText(
          `They stay Offboarded until ${formatReturnDate(day(3), { weekday: true })}.`,
        ),
      ).toBeInTheDocument();
      confirm("Schedule restore");

      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "activate",
        copyAction: "restore",
        startDate: day(3),
      });
    });

    it("moves, cancels and clears a planned return from Edit plan (51l)", () => {
      const returning = {
        status: "removed" as const,
        plannedStatus: "active" as const,
        plannedFrom: day(5),
      };
      const mutate = renderWithStatusMutation(returning);

      expect(
        screen.getByText(`Returns ${formatReturnDate(day(5), { weekday: true })}`),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      expect(screen.getByText("Change Mina Diaz's planned return?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Starts, / }));
      choose(day(7));
      confirm("Save changes");
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        action: "setPlannedChange",
        copyAction: "setPlannedChange",
        startDate: day(7),
        fromPlannedStatus: "active",
      });
      cleanup();

      const cancel = renderWithStatusMutation(returning);
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel planned return" }));
      confirm("Cancel planned return");
      expect(cancel.mock.calls[0]?.[0]).toMatchObject({ action: "cancelPlannedChange" });
      cleanup();

      const now = renderWithStatusMutation(returning);
      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      fireEvent.click(screen.getByRole("button", { name: /^Starts, / }));
      fireEvent.click(screen.getByRole("button", { name: "Today" }));
      expect(screen.getByText("Restore Mina Diaz?")).toBeInTheDocument();
      confirm("Restore");
      expect(now.mock.calls[0]?.[0]).toMatchObject({ action: "activate", startDate: undefined });
    });
  });

  describe("page layout", () => {
    function renderAsManager(person: Record<string, unknown>) {
      useBootstrap.mockReturnValue({
        data: {
          effectiveRole: "super_admin",
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
            canViewEmployeeDetails: true,
            canManageManagementAccess: true,
          },
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      } as never);
      useQuery.mockReturnValue({
        data: { person: makePerson(person) },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      });

      return render(<PersonDetailScreen />);
    }

    // Edit is about the page, not the person, so it takes the bar's trailing
    // slot, where iOS puts it, and it is the one place the word appears.
    it("puts Edit in the navigation bar, and clears it while editing", () => {
      renderAsManager({});

      const bar = within(screen.getByTestId("navigation-bar"));
      expect(bar.getByRole("button", { name: "Edit" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);

      fireEvent.click(bar.getByRole("button", { name: "Edit" }));

      expect(screen.getByText("Save changes")).toBeInTheDocument();
      expect(stackScreenOptions.at(-1)?.headerRight).toBeUndefined();
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Call" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
    });

    // Under the hero: Call and Email, always both, the one without a number or
    // address dimmed rather than dropped. At the foot: everything that manages
    // the person, in web's staff-panel order, access first and status last.
    it("keeps the contact pair under the hero and the management actions at the foot", () => {
      renderAsManager({
        userId: null,
        phone: "",
        focusAreaIds: [],
        pendingInvitation: { id: "inv-1", expiresAt: "2030-01-01T00:00:00.000Z" },
      });

      const call = screen.getByRole("button", { name: "Call" });
      const email = screen.getByRole("button", { name: "Email" });
      expect(call).toHaveAttribute("aria-disabled", "true");
      expect(email).toHaveAttribute("aria-disabled", "false");
      // Named, not icon-only: the label prints inside the pill.
      expect(call).toHaveTextContent("Call");
      expect(email).toHaveTextContent("Email");

      const names = screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent);
      const footStart = names.indexOf("Reinvite");
      expect(names.slice(footStart)).toEqual([
        "Reinvite",
        "Revoke invite",
        "Add to schedule",
        "Add to management",
      ]);
      // The status button sits in the status card, between the contact pair and the
      // sections; Offboard is the one change left for them, so it's named for it.
      expect(names.indexOf("Offboard")).toBeGreaterThan(names.indexOf("Email"));
      expect(names.indexOf("Offboard")).toBeLessThan(footStart);
      // The foot follows every section: Assignments is the last titled one.
      const assignments = screen.getByText("Assignments");
      expect(
        assignments.compareDocumentPosition(screen.getByRole("button", { name: "Reinvite" })) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // The pair sits above the sections.
      expect(
        call.compareDocumentPosition(assignments) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("keeps the pair, and nothing at the foot, for a viewer who cannot manage staff", () => {
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
          permissions: { canManageEmployees: false, canViewEmployeeDetails: true },
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      } as never);
      useQuery.mockReturnValue({
        data: { person: makePerson() },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      });

      render(<PersonDetailScreen />);

      expect(screen.getByRole("button", { name: "Call" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Email" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      expect(stackScreenOptions.at(-1)?.headerRight).toBeUndefined();
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

      expect(screen.queryByRole("button", { name: "Add to management" })).not.toBeInTheDocument();
    });

    it("names the action for whether they are already on the roster", () => {
      renderWithManagementAccess({});
      expect(screen.getByRole("button", { name: "Add to management" })).toBeInTheDocument();

      renderWithManagementAccess({ person: { managementDepartmentIds: [9] } });
      expect(screen.getByRole("button", { name: "Edit management access" })).toBeInTheDocument();
    });

    // Management settings always open in a popup over whatever raised them,
    // never as a page of their own. The form's own behaviour is covered in
    // ManagementAccessSheet's tests.
    it("opens management access in a sheet, not a pushed screen", () => {
      renderWithManagementAccess({});

      fireEvent.click(screen.getByRole("button", { name: "Add to management" }));

      // The button and, now, the sheet's title.
      expect(screen.getAllByText("Add to management")).toHaveLength(2);
      expect(routerPush).not.toHaveBeenCalled();
    });

    it("offers only the org's management departments, never its scheduled ones", () => {
      renderWithManagementAccess({});

      fireEvent.click(screen.getByRole("button", { name: "Add to management" }));

      expect(screen.getByRole("checkbox", { name: "Operations" })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: "North Wing" })).not.toBeInTheDocument();
    });

    // A grant to someone with no account is an invitation, and an invitation
    // needs an address. The button stays off the page rather than opening a
    // sheet that can only say so.
    it("offers no Add to Management to someone with no email on file", () => {
      renderWithManagementAccess({ person: { email: "" } });

      expect(screen.queryByRole("button", { name: "Add to management" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit management access" }),
      ).not.toBeInTheDocument();
    });

    // Existing access stays editable and removable whatever the contact
    // details say: taking someone off the roster must never need an address.
    it("keeps Edit Management Access for someone already on the roster without an email", () => {
      renderWithManagementAccess({ person: { email: "", managementDepartmentIds: [9] } });

      expect(screen.getByRole("button", { name: "Edit management access" })).toBeInTheDocument();
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

      expect(screen.getByRole("button", { name: "Add to management" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit management access" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("access level in the editor", () => {
    function renderForAccess(options: {
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
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      return mutationCalls;
    }

    const accessRow = () => screen.getByRole("button", { name: /^Access level/ });

    // The role is the first setting in the editor, ahead of the name, and it
    // opens the picker on its own rather than riding on Save.
    it("puts the access level first in the editor for a linked member", () => {
      renderForAccess({
        person: { orgRole: "user", membershipUpdatedAt: "2026-01-01T00:00:00.000Z" },
      });

      expect(accessRow()).toHaveTextContent("User");
      const headings = ["Access", "Basic info"].map((title) => screen.getByText(title));
      expect(
        headings[0]!.compareDocumentPosition(headings[1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      fireEvent.click(accessRow());
      expect(screen.getByRole("button", { name: /^Admin/ })).toBeInTheDocument();
    });

    // Nothing carries a role for someone with neither an account nor an invite,
    // so there is nothing for the picker to write. Web prints a dash here.
    it("leaves the row out with no account and no invitation", () => {
      renderForAccess({ person: { orgRole: null, userId: null } });

      expect(screen.queryByRole("button", { name: /^Access level/ })).not.toBeInTheDocument();
      expect(screen.queryByText("Access")).not.toBeInTheDocument();
    });

    it("leaves the row out without the permission", () => {
      renderForAccess({
        canManageManagementAccess: false,
        person: { orgRole: "user", membershipUpdatedAt: "2026-01-01T00:00:00.000Z" },
      });

      expect(screen.queryByRole("button", { name: /^Access level/ })).not.toBeInTheDocument();
    });

    // The invitation's `roleToAssign` is the role until it is accepted; reading
    // `orgRole` alone showed a pending Admin as "User".
    it("shows a pending invitation with the role it will grant", () => {
      renderForAccess({
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

      expect(accessRow()).toHaveTextContent("Admin");
    });

    it("sends the picked role once the change is confirmed", () => {
      const mutationCalls = renderForAccess({
        person: { orgRole: "user", membershipUpdatedAt: "2026-01-01T00:00:00.000Z" },
      });

      fireEvent.click(accessRow());
      fireEvent.click(screen.getByRole("button", { name: /^Admin/ }));
      confirmDialog("Change role");

      expect(allMutatePayloads(mutationCalls)).toContain("admin");
    });

    it("asks about revoking and resending when the role lives on an invitation", () => {
      renderForAccess({
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

      fireEvent.click(accessRow());
      fireEvent.click(screen.getByRole("button", { name: /^Admin/ }));

      expect(screen.getByText(/^Change access from .+ to Admin\?$/)).toBeInTheDocument();
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
      fireEvent.click(screen.getByRole("checkbox", { name: "Skilled Nursing" }));

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
      fireEvent.click(screen.getByRole("checkbox", { name: "Skilled Nursing" }));
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
      fireEvent.click(screen.getByRole("checkbox", { name: "Skilled Nursing" }));

      expect(
        screen.queryByText(
          "Saving now removes them from the schedule. They'll keep management access.",
        ),
      ).not.toBeInTheDocument();
    });

    it("confirms the manager's identity before changing a linked account's email", async () => {
      const mutationCalls = renderForSchedule({ userId: "user-2", email: "old@dubgrid.test" });

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@dubgrid.test" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(screen.getByText("Change the staff email to new@dubgrid.test?")).toBeInTheDocument();
      confirmDialog("Save");

      await waitFor(() => expect(stepUpRun).toHaveBeenCalledTimes(1));
      expect(requireMobileCredentialAssurance).toHaveBeenCalledWith("step-up-token");
      const payloads = mutationCalls.flatMap((call) =>
        call.mutateAsync.mock.calls.map(([payload]) => payload),
      );
      expect(payloads).toContainEqual(
        expect.objectContaining({ email: "new@dubgrid.test", actionAccessToken: "step-up-token" }),
      );
    });

    it("saves a new email for a person without an account without step-up", async () => {
      const mutationCalls = renderForSchedule({ userId: null, email: "old@dubgrid.test" });

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@dubgrid.test" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      confirmDialog("Save");

      await waitFor(() =>
        expect(
          mutationCalls.flatMap((call) => call.mutateAsync.mock.calls.map(([p]) => p)),
        ).toContainEqual(expect.objectContaining({ email: "new@dubgrid.test" })),
      );
      expect(stepUpRun).not.toHaveBeenCalled();
    });

    it("blocks clearing the email of a linked account", () => {
      renderForSchedule({ userId: "user-2", email: "old@dubgrid.test" });

      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: "An account needs an email to sign in with." }),
      );
      expect(stepUpRun).not.toHaveBeenCalled();
    });

    it("offers Add to Schedule to someone who isn't on it", () => {
      renderForSchedule({ focusAreaIds: [], managementDepartmentIds: [9] });

      expect(screen.getByRole("button", { name: "Add to schedule" })).toBeInTheDocument();
    });

    it("withholds Add to Schedule from someone already on it", () => {
      renderForSchedule({ focusAreaIds: [2] });

      expect(screen.queryByRole("button", { name: "Add to schedule" })).not.toBeInTheDocument();
    });

    it("opens the add-to-schedule screen rather than stacking a sheet", () => {
      renderForSchedule({ focusAreaIds: [], managementDepartmentIds: [9] });

      fireEvent.click(screen.getByRole("button", { name: "Add to schedule" }));

      expect(routerPush).toHaveBeenCalledWith({
        pathname: "/person/[id]/schedule",
        params: { id: "emp-1" },
      });
    });
  });
  describe("losing a focus area (51i)", () => {
    const refusal = new ApiResponseError("Choose", 409, {
      code: "FOCUS_AREA_SHIFTS_DECISION",
      error: "Choose whether to clear or keep their 2 upcoming shifts in East Wing.",
      focusAreaShifts: [
        {
          focusAreaId: 5,
          focusAreaName: "East Wing",
          count: 2,
          firstDate: "2026-11-03",
          lastDate: "2026-11-05",
        },
      ],
    });

    function renderEditing() {
      // The save runs for real through the mutation, so the question it asks is on screen.
      useMutation.mockImplementation(
        (options: {
          mutationFn: (variables: unknown) => Promise<unknown>;
          onSuccess?: (result: unknown) => unknown;
          onError?: (error: unknown) => void;
        }) => ({
          error: null,
          isPending: false,
          mutate: vi.fn(),
          mutateAsync: async (variables: unknown) => {
            try {
              const result = await options.mutationFn(variables);
              await options.onSuccess?.(result);
              return result;
            } catch (error) {
              options.onError?.(error);
            }
          },
        }),
      );
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
          focusAreas: [
            { id: 2, name: "Skilled Nursing", departmentId: 4 },
            { id: 5, name: "East Wing", departmentId: 4 },
          ],
          roles: [{ id: 3, name: "Charge Nurse" }],
          certifications: [],
          departments: [{ id: 4, name: "North Wing" }],
          permissions: { canManageEmployees: true, canViewEmployeeDetails: true },
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      } as never);
      const person = makePerson({ focusAreaIds: [2, 5] });
      useQuery.mockReturnValue({
        data: { person },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      });
      render(<PersonDetailScreen />);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "East Wing" }));
      return person;
    }

    beforeEach(() => {
      updateMobilePerson.mockReset();
    });

    it("asks before saving, and sends the save again with Keep shifts", async () => {
      const person = renderEditing();
      updateMobilePerson.mockImplementation(
        async (_token, _id, body: { focusAreaShifts?: string }) => {
          if (!body.focusAreaShifts) throw refusal;
          return { success: true, person: { ...person, focusAreaIds: [2], version: 8 } };
        },
      );
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(
        await screen.findByText(
          `Clear ${person.firstName} ${person.lastName}'s upcoming shifts in East Wing?`,
        ),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Keep shifts" }));

      await waitFor(() => expect(updateMobilePerson).toHaveBeenCalledTimes(2));
      expect(updateMobilePerson.mock.calls[0]![2]).not.toHaveProperty("focusAreaShifts");
      expect(updateMobilePerson.mock.calls[1]![2]).toMatchObject({
        focusAreaIds: [2],
        focusAreaShifts: "keep",
      });
      await waitFor(() =>
        expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Person saved" })),
      );
    });

    it("keeps the form open, unsaved, when the question is closed", async () => {
      renderEditing();
      updateMobilePerson.mockRejectedValue(refusal);
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await screen.findByText(/upcoming shifts in East Wing\?$/);
      fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);

      await waitFor(() =>
        expect(screen.queryByText(/upcoming shifts in East Wing\?$/)).not.toBeInTheDocument(),
      );
      expect(updateMobilePerson).toHaveBeenCalledTimes(1);
      expect(pushToast).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    });
  });
});
