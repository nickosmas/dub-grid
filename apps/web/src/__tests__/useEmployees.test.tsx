import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEmployees } from "@/hooks/useEmployees";
import { createTestQueryClient } from "@/test-utils/renderWithQuery";
import { makeEmployee } from "@/__tests__/factories";
import type { Invitation } from "@/types";

const mockFetchEmployees = vi.fn();
const mockUpdateEmployee = vi.fn();
const mockRemoveEmployee = vi.fn();
const mockDeactivateEmployee = vi.fn();
const mockActivateEmployee = vi.fn();
const mockCreateOrganizationInvitation = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/features/employees/client", () => {
  class MockEmployeeProfileConflictError extends Error {
    constructor(public readonly latestEmployee: unknown) {
      super("Employee details changed elsewhere.");
      this.name = "EmployeeProfileConflictError";
    }
  }
  class MockEmployeeStatusConflictError extends Error {
    constructor(public readonly latestEmployee: unknown) {
      super("Employee status changed elsewhere.");
      this.name = "EmployeeStatusConflictError";
    }
  }
  return {
    activateEmployee: (...args: unknown[]) => mockActivateEmployee(...args),
    deactivateEmployee: (...args: unknown[]) => mockDeactivateEmployee(...args),
    EmployeeProfileConflictError: MockEmployeeProfileConflictError,
    EmployeeStatusConflictError: MockEmployeeStatusConflictError,
    fetchEmployees: (...args: unknown[]) => mockFetchEmployees(...args),
    insertEmployee: vi.fn(),
    removeEmployee: (...args: unknown[]) => mockRemoveEmployee(...args),
    updateEmployee: (...args: unknown[]) => mockUpdateEmployee(...args),
  };
});

vi.mock("@/features/organization/client", () => ({
  createOrganizationInvitation: (...args: unknown[]) => mockCreateOrganizationInvitation(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

vi.mock("@/hooks/useOrgRealtimeInvalidation", () => ({
  useOrgRealtimeInvalidation: vi.fn(),
}));

const EMPLOYEE = makeEmployee({ id: "emp-1", email: "old@example.com", version: 3 });

const OLD_INVITATION: Invitation = {
  id: "inv-1",
  orgId: "org-1",
  invitedBy: null,
  email: "old@example.com",
  roleToAssign: "admin",
  expiresAt: "2099-01-01T00:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  employeeId: "emp-1",
  firstName: "Test",
  lastName: "Employee",
  phone: null,
  departmentIds: [10],
  deptAdminIds: [11],
};

function renderReady() {
  // A fresh QueryWrapper-style component recreates its QueryClient on every
  // re-render (no memoization), which wipes useQuery's cache mid-test the
  // instant a handler under test calls setState. Build the client once and
  // hand it to a stable wrapper instead.
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useEmployees("org-1"), { wrapper });
  return waitFor(() => expect(result.current.employees.length).toBeGreaterThan(0)).then(
    () => result,
  );
}

describe("useEmployees — handleSaveEmployeeWithReinvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchEmployees.mockResolvedValue([EMPLOYEE]);
    mockUpdateEmployee.mockImplementation(async (employee) => ({
      ...employee,
      version: employee.version + 1,
    }));
    mockCreateOrganizationInvitation.mockResolvedValue({
      invitationId: "inv-2",
      token: "fresh-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "",
        json: async () => ({ success: true }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves the identity change, then creates and sends a new invitation reusing the old role/departments", async () => {
    const result = await renderReady();
    const updated = { ...EMPLOYEE, email: "new@example.com" };

    await act(async () => {
      await result.current.handleSaveEmployeeWithReinvite(updated, OLD_INVITATION, "Acme Org");
    });

    expect(mockUpdateEmployee).toHaveBeenCalledWith(updated, "org-1", updated.version);
    expect(mockCreateOrganizationInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        role: "admin",
        orgId: "org-1",
        employeeId: "emp-1",
        departmentIds: [10],
        deptAdminIds: [11],
      }),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("new@example.com"));
    expect(result.current.employees.find((e) => e.id === "emp-1")?.email).toBe("new@example.com");
  });

  it("shows a distinct error but keeps the saved employee when the identity save succeeds but sending the new invite fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => JSON.stringify({ error: "delivery failed" }),
      }),
    );
    const result = await renderReady();
    const updated = { ...EMPLOYEE, email: "new@example.com" };

    await act(async () => {
      await result.current.handleSaveEmployeeWithReinvite(updated, OLD_INVITATION, "Acme Org");
    });

    expect(mockUpdateEmployee).toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("Employee saved"));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    // The identity save already succeeded — must not roll back just because
    // the follow-up invite send failed.
    expect(result.current.employees.find((e) => e.id === "emp-1")?.email).toBe("new@example.com");
  });

  it("rolls back and never attempts the new invitation when the identity save itself fails", async () => {
    mockUpdateEmployee.mockRejectedValueOnce(new Error("db unavailable"));
    const result = await renderReady();
    const updated = { ...EMPLOYEE, email: "new@example.com" };

    await act(async () => {
      await result.current.handleSaveEmployeeWithReinvite(updated, OLD_INVITATION, "Acme Org");
    });

    expect(mockCreateOrganizationInvitation).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("db unavailable");
    expect(result.current.employees.find((e) => e.id === "emp-1")?.email).toBe("old@example.com");
  });
});

// Regression coverage for a real bug found while testing the reinvite flow
// above: every one of these handlers captured its pre-update snapshot via
// `let prevAll; setAllLocal(prev => { prevAll = prev; ... })`, reading
// `prevAll` again immediately afterward. That updater isn't guaranteed to
// run before the next line executes, so on failure `setAllLocal(prevAll)`
// could apply the *initial* `[]` value instead of the real snapshot,
// silently wiping the whole list. Fixed by reading the snapshot from
// `allEmployeesRef.current` (a ref, always synchronously current) instead.
describe("useEmployees — rollback keeps the full list on failure (not just the reverted row)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchEmployees.mockResolvedValue([EMPLOYEE]);
  });

  it("handleSaveEmployee restores the pre-edit list on failure", async () => {
    mockUpdateEmployee.mockRejectedValueOnce(new Error("db unavailable"));
    const result = await renderReady();

    await act(async () => {
      await result.current.handleSaveEmployee({ ...EMPLOYEE, email: "new@example.com" });
    });

    expect(result.current.employees).toEqual([EMPLOYEE]);
  });

  it("handleRemoveEmployee restores the pre-removal list on failure", async () => {
    mockRemoveEmployee.mockRejectedValueOnce(new Error("db unavailable"));
    const result = await renderReady();

    await act(async () => {
      await result.current.handleRemoveEmployee("emp-1");
    });

    expect(result.current.employees).toEqual([EMPLOYEE]);
  });

  it("handleDeactivateEmployee restores the pre-change list on failure", async () => {
    mockDeactivateEmployee.mockRejectedValueOnce(new Error("db unavailable"));
    const result = await renderReady();

    await act(async () => {
      await result.current.handleDeactivateEmployee("emp-1");
    });

    expect(result.current.employees).toEqual([EMPLOYEE]);
  });

  it("handleActivateEmployee restores the pre-change list on failure", async () => {
    mockActivateEmployee.mockRejectedValueOnce(new Error("db unavailable"));
    const result = await renderReady();

    await act(async () => {
      await result.current.handleActivateEmployee("emp-1");
    });

    expect(result.current.employees).toEqual([EMPLOYEE]);
  });
});
