import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DangerZone from "@/components/settings/DangerZone";
import type { Organization } from "@/types";

const mockSignOut = vi.fn();
const mockIsInSandbox = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();
const captureException = vi.fn();
const stepUpRun = vi.fn();
const requireCredentialAssurance = vi.fn();

vi.mock("@/hooks", () => ({
  useLogout: () => ({ signOut: mockSignOut }),
  useIsInSandbox: () => mockIsInSandbox(),
  useMediaQuery: () => false,
  MOBILE: "(max-width: 767px)",
}));
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (...args: unknown[]) => requireCredentialAssurance(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

vi.mock("@/lib/client-facing", () => ({
  formatClientErrorMessage: (err: unknown, fallback: string) => (err as Error)?.message ?? fallback,
}));

const organization = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Acme",
} as Organization;

const CONFIRM_PHRASE = "DELETE Acme";

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /delete organization/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsInSandbox.mockReturnValue(false);
  stepUpRun.mockReset().mockImplementation(async (action: (token: string) => Promise<unknown>) => {
    await action("fresh-token");
    return true;
  });
  requireCredentialAssurance.mockReset().mockResolvedValue({ success: true });
  // Default: 200 OK
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch,
  );
});

describe("DangerZone", () => {
  it("disables the delete button in sandbox mode", () => {
    mockIsInSandbox.mockReturnValue(true);
    render(<DangerZone organization={organization} />);
    const btn = screen.getByRole("button", { name: /delete organization/i });
    expect(btn).toBeDisabled();
  });

  it("disables confirmation until the exact phrase is typed", () => {
    render(<DangerZone organization={organization} />);
    openDialog();

    const input = screen.getByRole("textbox");
    const confirmButtons = screen.getAllByRole("button", { name: /delete organization/i });
    const confirmBtn = confirmButtons[confirmButtons.length - 1];

    expect(confirmBtn).toBeDisabled();
    fireEvent.change(input, { target: { value: "delete acme" } });
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(input, { target: { value: CONFIRM_PHRASE } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("posts to /api/organizations/delete and signs out on success", async () => {
    render(<DangerZone organization={organization} />);
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: CONFIRM_PHRASE },
    });
    const confirmButtons = screen.getAllByRole("button", { name: /delete organization/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await new Promise((r) => setTimeout(r, 0));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/organizations/delete",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fresh-token",
        },
        body: JSON.stringify({
          orgId: organization.id,
          confirmation: CONFIRM_PHRASE,
        }),
      }),
    );
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
    expect(toastSuccess).toHaveBeenCalledWith("Organization deleted.");
    expect(toastError).not.toHaveBeenCalled();
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
  });

  it("keeps the typed confirmation and does not delete when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValueOnce(false);
    render(<DangerZone organization={organization} />);
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: CONFIRM_PHRASE } });
    const confirmButtons = screen.getAllByRole("button", { name: /delete organization/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await screen.findByDisplayValue(CONFIRM_PHRASE);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete organization" })).toBeInTheDocument();
  });

  it("toasts a generic message on a failed delete and does not sign out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "Internal" }),
      })) as unknown as typeof fetch,
    );

    render(<DangerZone organization={organization} />);
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: CONFIRM_PHRASE },
    });
    const confirmButtons = screen.getAllByRole("button", { name: /delete organization/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("captures and toasts when signOut throws after a successful delete", async () => {
    mockSignOut.mockImplementationOnce(() => {
      throw new Error("nav-failed");
    });

    render(<DangerZone organization={organization} />);
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: CONFIRM_PHRASE },
    });
    const confirmButtons = screen.getAllByRole("button", { name: /delete organization/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await new Promise((r) => setTimeout(r, 0));

    expect(captureException).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Organization deleted.");
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/sign you out/i));
  });
});
