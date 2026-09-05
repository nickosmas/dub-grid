import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";
import {
  navigatedActions,
  pressBack,
  resetNavigationShim,
} from "../../../test/shims/react-navigation-native";

const useMutation = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const pushToast = vi.fn();
const routerPush = vi.fn();
const routerBack = vi.fn();
const createMobilePerson = vi.fn();
const createMobilePersonInvitation = vi.fn();
const checkMobilePersonContact = vi.fn();
const parseMobileContactConflict = vi.fn();
const parseMobileStaffFieldErrors = vi.fn();

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
  checkMobilePersonContact: (...args: unknown[]) => checkMobilePersonContact(...args),
  parseMobileContactConflict: (...args: unknown[]) => parseMobileContactConflict(...args),
  parseMobileStaffFieldErrors: (...args: unknown[]) => parseMobileStaffFieldErrors(...args),
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
    resetNavigationShim();
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    pushToast.mockReset();
    routerPush.mockReset();
    routerBack.mockReset();
    createMobilePerson.mockReset();
    createMobilePersonInvitation.mockReset();
    checkMobilePersonContact.mockReset();
    parseMobileContactConflict.mockReset();
    parseMobileStaffFieldErrors.mockReset();

    checkMobilePersonContact.mockResolvedValue({ email: null, phone: null });
    parseMobileContactConflict.mockReturnValue(null);
    parseMobileStaffFieldErrors.mockReturnValue(null);
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

  it("says the form could not load rather than rendering it with empty pickers", () => {
    // Gating on `isLoading` alone let a failed bootstrap fall straight through
    // to the form, which then showed an empty Assignments picker next to a live
    // "Select at least one" error, and no way to retry. That is the exact state
    // the loading branch exists to avoid.
    const refetch = vi.fn();
    useBootstrap.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
      refetch,
    });

    renderWithMutation();

    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(screen.getByText("Could not load this form")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("disables submit until first name, last name, and a focus area are set", () => {
    renderWithMutation();

    expect(screen.getByRole("button", { name: "Add person" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Torres" } });
    expect(screen.getByRole("button", { name: "Add person" })).toBeDisabled();

    fireEvent.click(screen.getByText("Skilled Nursing"));
    expect(screen.getByRole("button", { name: "Add person" })).not.toBeDisabled();
  });

  it("names the organization's focus-area label as a singular noun in the validation error", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { labels: { focusArea: "Wings", certification: "Certification" } },
        focusAreas: [{ id: 2, name: "Skilled Nursing" }],
        certifications: [],
      },
    });
    renderWithMutation();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });

    expect(screen.getByText("Select at least one wing")).toBeInTheDocument();
    expect(screen.queryByText("Select at least one Wings")).not.toBeInTheDocument();
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

  it("submits one create when Add person is pressed twice in the same tick", async () => {
    createMobilePerson.mockResolvedValue({
      success: true,
      person: { id: "emp-1" },
    });
    renderWithMutation();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Torres" } });
    fireEvent.click(screen.getByText("Skilled Nursing"));
    const submit = screen.getByRole("button", { name: "Add person" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(createMobilePerson).toHaveBeenCalledTimes(1));
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

  it("says so when the person was created but the invitation could not be sent", async () => {
    createMobilePerson.mockResolvedValue({
      success: true,
      person: { id: "emp-1" },
    });
    createMobilePersonInvitation.mockRejectedValue(new Error("smtp down"));
    renderWithMutation();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Torres" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "nia@dubgrid.com" },
    });
    fireEvent.click(screen.getByText("Skilled Nursing"));
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "warning",
          title: "Person added, invitation not sent",
        }),
      );
    });
    // The person really was created, so this stays a success path.
    expect(routerBack).toHaveBeenCalled();
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

  it("leaves an untouched form without asking", () => {
    renderWithMutation();

    act(() => {
      expect(pressBack()).toBe(false);
    });
    expect(navigatedActions).toEqual([{ type: "GO_BACK" }]);
  });

  it("asks before a back press throws away a part-filled form", () => {
    renderWithMutation();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });

    act(() => {
      expect(pressBack()).toBe(true);
    });
    expect(navigatedActions).toHaveLength(0);
    expect(screen.getByText("Discard this staff profile?")).toBeInTheDocument();
  });

  it("keeps the form when the back press is called off", () => {
    renderWithMutation();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });
    act(() => {
      pressBack();
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep Editing" }));

    expect(navigatedActions).toHaveLength(0);
    expect(screen.getByLabelText("First name")).toHaveValue("Nia");
  });

  describe("duplicate contact details", () => {
    // The focus-area picker toggles, so filling the required fields is its own
    // step: calling it twice in one test would deselect what the first call set
    // and disable the button for a reason the test isn't about.
    function fillRequiredFields() {
      fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });
      fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Torres" } });
      fireEvent.click(screen.getByText("Skilled Nursing"));
    }

    async function typeEmail(value: string) {
      fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }

    async function fillFormWithEmail(value: string) {
      fillRequiredFields();
      await typeEmail(value);
    }

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("blocks the save and names the duplicate under the field", async () => {
      checkMobilePersonContact.mockResolvedValue({
        email: { conflict: true, reason: "employee_duplicate" },
        phone: null,
      });
      renderWithMutation();

      await fillFormWithEmail("taken@dubgrid.com");

      expect(
        screen.getByText("That email is already used by another person on your team."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add person" })).toBeDisabled();
    });

    it("retires the verdict once the address changes", async () => {
      checkMobilePersonContact.mockResolvedValue({
        email: { conflict: true, reason: "employee_duplicate" },
        phone: null,
      });
      renderWithMutation();
      await fillFormWithEmail("taken@dubgrid.com");

      checkMobilePersonContact.mockResolvedValue({ email: { conflict: false }, phone: null });
      await typeEmail("free@dubgrid.com");

      expect(
        screen.queryByText("That email is already used by another person on your team."),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add person" })).not.toBeDisabled();
    });

    // The 409 on submit is the real gate, so a check that couldn't run must not
    // be what stops a legitimate save.
    it("lets the save through when the check itself fails", async () => {
      checkMobilePersonContact.mockRejectedValue(new Error("offline"));
      renderWithMutation();

      await fillFormWithEmail("someone@dubgrid.com");

      expect(screen.getByRole("button", { name: "Add person" })).not.toBeDisabled();
    });

    it("never asks about an address that isn't valid yet", async () => {
      renderWithMutation();

      await fillFormWithEmail("nia@");

      expect(checkMobilePersonContact).not.toHaveBeenCalled();
    });

    it("marks the field when the create is rejected as a duplicate", async () => {
      parseMobileContactConflict.mockReturnValue({
        field: "email",
        message: "That email is already used by another person.",
      });
      createMobilePerson.mockRejectedValue(new Error("409"));
      renderWithMutation();

      await fillFormWithEmail("taken@dubgrid.com");
      fireEvent.click(screen.getByRole("button", { name: "Add person" }));

      await waitFor(() => {
        expect(
          screen.getByText("That email is already used by another person."),
        ).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: "Add person" })).toBeDisabled();
    });
  });

  it("does not ask on the way out after the person was saved", () => {
    // The success handler navigates away with the fields still filled in, so a
    // guard that only watched the fields would meet a saved person with
    // "discard your changes?".
    renderWithMutation({ isSuccess: true });

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Nia" } });

    act(() => {
      expect(pressBack()).toBe(false);
    });
    expect(navigatedActions).toEqual([{ type: "GO_BACK" }]);
  });
});
