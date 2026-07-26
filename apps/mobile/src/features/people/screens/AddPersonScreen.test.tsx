import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const pushToast = vi.fn();
const routerPush = vi.fn();
const routerBack = vi.fn();
const createMobilePerson = vi.fn();
const createMobilePersonInvitation = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  onlineManager: {
    isOnline: () => true,
  },
  useMutation,
  useQueryClient,
}));

vi.mock("expo-router", () => ({
  router: {
    push: routerPush,
    back: routerBack,
  },
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("../../../shared/lib/api", () => ({
  createMobilePerson: (...args: unknown[]) => createMobilePerson(...args),
  createMobilePersonInvitation: (...args: unknown[]) => createMobilePersonInvitation(...args),
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

let AddPersonScreen: (typeof import("./AddPersonScreen"))["default"];

beforeAll(async () => {
  AddPersonScreen = (await import("./AddPersonScreen")).default;
});

describe("AddPersonScreen", () => {
  beforeEach(() => {
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    pushToast.mockReset();
    routerPush.mockReset();
    routerBack.mockReset();
    createMobilePerson.mockReset();
    createMobilePersonInvitation.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: {
          labels: {
            focusArea: "Focus Areas",
            certification: "Certification",
          },
        },
        focusAreas: [{ id: 2, name: "Skilled Nursing" }],
        certifications: [{ id: 9, name: "RN", abbr: "RN" }],
      },
    });
    useQueryClient.mockReturnValue({
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    });
  });

  function renderWithMutation(overrides?: Partial<ReturnType<typeof useMutation>>) {
    let mutationFn: (() => Promise<unknown>) | undefined;
    let onSuccess: ((result: unknown) => Promise<void> | void) | undefined;
    let onError: ((error: unknown) => void) | undefined;
    useMutation.mockImplementation((config: any) => {
      mutationFn = config.mutationFn;
      onSuccess = config.onSuccess;
      onError = config.onError;
      return {
        isPending: false,
        isError: false,
        mutate: () => {
          void mutationFn?.()
            .then((result) => onSuccess?.(result))
            .catch((error) => onError?.(error));
        },
        ...overrides,
      };
    });
    render(<AddPersonScreen />);
  }

  it("disables submit until first name, last name, and a focus area are set", () => {
    renderWithMutation();

    expect(screen.getByRole("button", { name: "Add person" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Torres" } });
    expect(screen.getByRole("button", { name: "Add person" })).toBeDisabled();

    fireEvent.click(screen.getByText("Skilled Nursing"));
    expect(screen.getByRole("button", { name: "Add person" })).not.toBeDisabled();
  });

  it("creates the person and navigates back on success, without inviting when no email is set", async () => {
    createMobilePerson.mockResolvedValue({
      success: true,
      person: { id: "emp-1" },
    });
    renderWithMutation();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Torres" } });
    fireEvent.click(screen.getByText("Skilled Nursing"));
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));

    await waitFor(() => {
      expect(createMobilePerson).toHaveBeenCalledWith("token-123", {
        firstName: "Nia",
        lastName: "Torres",
        employmentType: "full_time",
        certificationId: null,
        focusAreaIds: [2],
        email: "",
      });
    });
    expect(createMobilePersonInvitation).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(routerBack).toHaveBeenCalled();
    });
  });

  it("sends an invitation when an email is provided", async () => {
    createMobilePerson.mockResolvedValue({
      success: true,
      person: { id: "emp-1" },
    });
    createMobilePersonInvitation.mockResolvedValue({});
    renderWithMutation();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Torres" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "nia@dubgrid.com" },
    });
    fireEvent.click(screen.getByText("Skilled Nursing"));
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));

    await waitFor(() => {
      expect(createMobilePersonInvitation).toHaveBeenCalledWith("token-123", "emp-1", {
        email: "nia@dubgrid.com",
      });
    });
  });

  it("shows an error toast when creation fails", async () => {
    createMobilePerson.mockRejectedValue(new Error("boom"));
    renderWithMutation();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Torres" } });
    fireEvent.click(screen.getByText("Skilled Nursing"));
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({ tone: "error", title: "Could not add person" }),
      );
    });
    expect(routerBack).not.toHaveBeenCalled();
  });
});
