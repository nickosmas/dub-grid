import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery as render } from "@/test-utils/renderWithQuery";
import PeoplePageContent from "@/app/(app)/people/PeoplePageContent";

const mocks = vi.hoisted(() => ({
  deactivate: vi.fn(),
  remove: vi.fn(),
  prompt: vi.fn(),
  result: vi.fn(),
  cancel: false,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/RouteGuards", () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ProgressBar", () => ({ default: () => null }));
vi.mock("@/components/AddEmployeeModal", () => ({ default: () => null }));
vi.mock("@/components/StaffView", () => ({
  default: ({
    onDeactivate,
    onRemove,
  }: {
    onDeactivate: (empId: string, note?: string) => unknown;
    onRemove: (empId: string, note?: string) => unknown;
  }) => (
    <>
      <button
        onClick={() => void Promise.resolve(onDeactivate("emp-1", "On leave")).then(mocks.result)}
      >
        Deactivate
      </button>
      <button onClick={() => void onRemove("emp-1", "Left")}>Remove</button>
    </>
  ),
}));
vi.mock("@/hooks", () => ({
  usePermissions: () => ({ canViewStaff: true, isLoading: false, orgId: "org-1" }),
  useOrganizationData: () => ({
    org: { id: "org-1" },
    focusAreas: [],
    loading: false,
    loadError: null,
    setupStatus: { isComplete: true },
  }),
  useEmployees: () => ({
    employees: [],
    inactiveEmployees: [],
    removedEmployees: [],
    loading: false,
    handleRemoveEmployee: mocks.remove,
    handleDeactivateEmployee: mocks.deactivate,
  }),
}));
// Stands in for the shared prompt: a refusal the page hands back is retried
// with an assured token, as the real hook does after the person confirms.
vi.mock("@/hooks/useSharedStepUp", () => ({
  useSharedStepUp: () => ({
    dialog: null,
    run: async (action: (accessToken?: string) => Promise<unknown>) => {
      try {
        await action();
        return true;
      } catch (error) {
        if ((error as { code?: string }).code !== "STEP_UP_REQUIRED") throw error;
        mocks.prompt();
        if (mocks.cancel) return false;
        await action("assured-token");
        return true;
      }
    },
  }),
}));

const refusal = () =>
  Object.assign(new Error("Confirm your identity."), {
    status: 403,
    code: "STEP_UP_REQUIRED",
    method: "password",
  });

describe("PeoplePageContent status changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancel = false;
  });

  it.each([
    ["Deactivate", mocks.deactivate, "On leave"],
    ["Remove", mocks.remove, "Left"],
  ] as const)("%s goes through step-up when the server asks", async (label, handler, note) => {
    handler.mockRejectedValueOnce(refusal()).mockResolvedValueOnce(undefined);
    render(<PeoplePageContent />);

    fireEvent.click(await screen.findByRole("button", { name: label }));

    await waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    expect(mocks.prompt).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenNthCalledWith(1, "emp-1", note, undefined);
    expect(handler).toHaveBeenNthCalledWith(2, "emp-1", note, "assured-token");
  });

  it("runs an admin's change once with no prompt", async () => {
    mocks.deactivate.mockResolvedValueOnce(undefined);
    render(<PeoplePageContent />);

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(mocks.deactivate).toHaveBeenCalledOnce());
    expect(mocks.prompt).not.toHaveBeenCalled();
  });

  it.each([
    [true, "the change went through", true],
    [false, "the change was refused and reported", false],
  ] as const)("resolves as %s when %s", async (expected, _label, handled) => {
    mocks.deactivate.mockResolvedValueOnce(handled);
    render(<PeoplePageContent />);

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(mocks.result).toHaveBeenCalledWith(expected));
  });

  it("resolves a cancelled prompt as not updated", async () => {
    mocks.cancel = true;
    mocks.deactivate.mockRejectedValueOnce(refusal());
    render(<PeoplePageContent />);

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(mocks.result).toHaveBeenCalledWith(false));
    expect(mocks.deactivate).toHaveBeenCalledOnce();
  });
});
