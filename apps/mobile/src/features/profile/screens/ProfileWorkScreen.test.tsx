import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReactNativeModule,
  createScreenModule,
} from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const updateMobilePerson = vi.fn();
const pushToast = vi.fn();

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () =>
  createScreenModule(await import("react")),
);

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
  updateProfilePhone: vi.fn(),
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
  },
  focusAreas: [
    {
      id: 2,
      name: "ICU",
    },
  ],
  pendingProfileChangeRequest: false,
};

describe("ProfileWorkScreen", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    updateMobilePerson.mockReset();
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
    }));
    updateMobilePerson.mockResolvedValue({
      success: true,
      person: profileData.linkedEmployee,
    });
  });

  it("saves manager staff edits from the profile work screen", async () => {
    render(<ProfileWorkScreen />);

    expect(
      screen.queryByRole("button", { name: "Edit staff profile" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Edit staff profile")).toBeInTheDocument();
    expect(screen.getByText("Employment")).toBeInTheDocument();
    expect(screen.getAllByText("Supervisor").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Last name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Phone")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "RN" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Save staff profile?")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Save" }),
    );

    await waitFor(() => {
      expect(updateMobilePerson).toHaveBeenCalledWith(
        "token-123",
        "d660d308-4e0d-4daf-84fd-6753405e6740",
        expect.objectContaining({
          expectedVersion: 4,
          firstName: "Mina",
          lastName: "Diaz",
          certificationId: 5,
          focusAreaIds: [2],
          roleIds: [3],
          departmentIds: [7],
        }),
      );
    });
  });
});
