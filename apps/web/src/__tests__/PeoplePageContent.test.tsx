import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery as render } from "@/test-utils/renderWithQuery";
import PeoplePageContent from "@/app/(app)/people/PeoplePageContent";

const mocks = vi.hoisted(() => ({
  deactivate: vi.fn(),
  remove: vi.fn(),
  bulk: vi.fn(),
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
    onBulkStatusChange,
  }: {
    onDeactivate: (empId: string, note?: string) => unknown;
    onRemove: (empId: string, note?: string) => unknown;
    onBulkStatusChange: (action: string, ids: string[], options: object) => Promise<unknown>;
  }) => (
    <>
      <button
        onClick={() =>
          void onBulkStatusChange("archive", ["emp-1", "emp-2"], { note: "Left" }).then(
            mocks.result,
          )
        }
      >
        Bulk offboard
      </button>
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
    handleBulkStatusChange: mocks.bulk,
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

describe("PeoplePageContent bulk status changes (51h)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancel = false;
  });

  it("asks for fresh proof once for the whole selection and resolves each outcome", async () => {
    const outcomes = [{ empId: "emp-1", ok: true }];
    mocks.bulk.mockRejectedValueOnce(refusal()).mockResolvedValueOnce(outcomes);
    render(<PeoplePageContent />);

    fireEvent.click(await screen.findByRole("button", { name: "Bulk offboard" }));

    await waitFor(() => expect(mocks.result).toHaveBeenCalledWith(outcomes));
    expect(mocks.prompt).toHaveBeenCalledOnce();
    expect(mocks.bulk).toHaveBeenNthCalledWith(
      2,
      "archive",
      ["emp-1", "emp-2"],
      { note: "Left" },
      "assured-token",
    );
  });

  it("resolves null for a cancelled prompt or a refused request", async () => {
    mocks.cancel = true;
    mocks.bulk.mockRejectedValueOnce(refusal());
    render(<PeoplePageContent />);
    fireEvent.click(await screen.findByRole("button", { name: "Bulk offboard" }));
    await waitFor(() => expect(mocks.result).toHaveBeenCalledWith(null));

    mocks.cancel = false;
    mocks.bulk.mockRejectedValueOnce(new Error("Too many requests"));
    fireEvent.click(screen.getByRole("button", { name: "Bulk offboard" }));
    await waitFor(() => expect(mocks.result).toHaveBeenCalledTimes(2));
    expect(mocks.result).toHaveBeenLastCalledWith(null);
  });
});
