import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReactNativeModule,
  createScreenModule,
} from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
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
  updateProfileAccount: vi.fn(),
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

let ProfileAccountScreen: (typeof import("./ProfileAccountScreen"))["default"];

beforeAll(async () => {
  ProfileAccountScreen = (await import("./ProfileAccountScreen")).default;
});

describe("ProfileAccountScreen", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    pushToast.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({
      data: {
        permissions: {
          canManageEmployees: true,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
    } as never);
    useQuery.mockReturnValue({
      data: {
        user: {
          firstName: "Mina",
          lastName: "Diaz",
          email: "mina@dubgrid.com",
        },
        linkedEmployee: {
          phone: "(415) 555-0199",
          version: 4,
        },
        pendingProfileChangeRequest: false,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    useMutation.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
    });
  });

  it("shows inline validation for invalid account details and blocks save confirmation", () => {
    render(<ProfileAccountScreen />);

    expect(screen.getByLabelText("Phone")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "123" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "not-an-email" },
    });

    expect(
      screen.getByText("First name must include at least one letter"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invalid email address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.queryByText("Save changes?")).not.toBeInTheDocument();
  });

  it("prompts before saving valid normalized account edits", () => {
    render(<ProfileAccountScreen />);

    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "  Mina   " },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "MINA+new@DUBGRID.COM " },
    });
    fireEvent.blur(screen.getByLabelText("Email"));

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Save changes?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Confirm that you want to save these account and contact changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("mina+new@dubgrid.com")).toBeInTheDocument();
  });
});
