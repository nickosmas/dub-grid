import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const useLocalSearchParams = vi.fn();
const pushToast = vi.fn();
const routerBack = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

vi.mock("@tanstack/react-query", () => ({
  onlineManager: { isOnline: () => true },
  useMutation,
  useQuery,
  useQueryClient,
}));

vi.mock("expo-router", () => ({
  router: { back: routerBack },
  useLocalSearchParams,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

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

const updateMobilePerson = vi.fn();

vi.mock("../../../shared/lib/api", () => ({
  getMobilePerson: vi.fn(),
  updateMobilePerson: (...args: unknown[]) => updateMobilePerson(...args),
}));

vi.mock("../../auth/hooks/useAccessToken", () => ({ useAccessToken }));
vi.mock("../../auth/hooks/useBootstrap", () => ({ useBootstrap }));
vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast }),
}));

let AddToScheduleScreen: (typeof import("./AddToScheduleScreen"))["default"];

beforeAll(async () => {
  AddToScheduleScreen = (await import("./AddToScheduleScreen")).default;
});

function allMutatePayloads(calls: Array<{ mutate: ReturnType<typeof vi.fn> }>) {
  return calls.flatMap((call) => call.mutate.mock.calls.map(([payload]) => payload));
}

function makePerson(overrides: Record<string, unknown> = {}) {
  return {
    id: "emp-1",
    employeeNumber: 12,
    firstName: "Mina",
    lastName: "Diaz",
    orgRole: "user",
    employmentType: "full_time",
    phone: "(415) 425-3334",
    email: "mina@dubgrid.com",
    status: "active",
    certificationId: null,
    roleIds: [],
    seniority: 2,
    focusAreaIds: [],
    departmentIds: [4],
    deptAdminIds: [],
    managementDepartmentIds: [9],
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

describe("AddToScheduleScreen", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    useLocalSearchParams.mockReset();
    pushToast.mockReset();
    routerBack.mockReset();
    updateMobilePerson.mockReset();
    updateMobilePerson.mockResolvedValue({ success: true, person: makePerson() });
    emptyStateTitles.length = 0;

    useAccessToken.mockReturnValue("token-123");
    useLocalSearchParams.mockReturnValue({ id: "emp-1" });
    useQueryClient.mockReturnValue({ setQueryData: vi.fn() });
    useMutation.mockReturnValue({ error: null, isPending: false, mutate: vi.fn() });
  });

  function renderScreen(options: {
    canManageEmployees?: boolean;
    person?: Record<string, unknown>;
    focusAreas?: { id: number; name: string }[];
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
          labels: { focusArea: "Focus Areas", role: "Roles", certification: "Certification" },
        },
        focusAreas: options.focusAreas ?? [
          { id: 2, name: "Skilled Nursing" },
          { id: 5, name: "Memory Care" },
        ],
        roles: [{ id: 3, name: "Charge Nurse" }],
        certifications: [{ id: 7, name: "RN", abbr: "RN" }],
        departments: [{ id: 9, name: "Operations", abbr: "OPS", type: "management" }],
        user: { id: "actor-1" },
        permissions: { canManageEmployees: options.canManageEmployees ?? true },
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

    render(<AddToScheduleScreen />);
    return mutationCalls;
  }

  it("refuses to draw the form without the permission", () => {
    renderScreen({ canManageEmployees: false });

    expect(emptyStateTitles).toContain("Scheduling unavailable");
    expect(screen.queryByRole("button", { name: "Add to schedule" })).not.toBeInTheDocument();
  });

  it("says so when the org has no focus areas to assign", () => {
    renderScreen({ focusAreas: [] });

    expect(emptyStateTitles).toContain("No focus areas");
  });

  it("holds the save until at least one focus area is picked", () => {
    const mutationCalls = renderScreen({});

    expect(screen.getByRole("button", { name: "Add to schedule" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add to schedule" }));
    expect(allMutatePayloads(mutationCalls)).toHaveLength(0);
  });

  it("sends the picked assignments", () => {
    const mutationCalls = renderScreen({});

    fireEvent.click(screen.getByRole("checkbox", { name: "Skilled Nursing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to schedule" }));

    expect(allMutatePayloads(mutationCalls)).toContainEqual(
      expect.objectContaining({ focusAreaIds: [2], roleIds: [], certificationId: null }),
    );
  });

  // The update contract wants the whole staff record, so anything this form
  // does not edit has to survive the round trip untouched. That assembly happens
  // inside `mutationFn`, below the payload the button hands to `mutate`, so this
  // runs the real thing rather than asserting one layer too high.
  it("carries the fields it doesn't edit back unchanged", async () => {
    renderScreen({});
    const [config] = useMutation.mock.calls.at(-1) as [
      { mutationFn: (draft: unknown) => Promise<unknown> },
    ];

    await config.mutationFn({ certificationId: 7, focusAreaIds: [2], roleIds: [3] });

    expect(updateMobilePerson).toHaveBeenCalledWith("token-123", "emp-1", {
      expectedVersion: 7,
      firstName: "Mina",
      lastName: "Diaz",
      employmentType: "full_time",
      phone: "(415) 425-3334",
      email: "mina@dubgrid.com",
      contactNotes: "Weekend availability",
      departmentIds: [4],
      certificationId: 7,
      focusAreaIds: [2],
      roleIds: [3],
    });
  });
});
