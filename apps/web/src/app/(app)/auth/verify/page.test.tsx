import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthVerifyPage from "./page";

const replace = vi.fn();
const verifyBrowserOtp = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/features/account/client", () => ({
  verifyBrowserOtp: (...args: unknown[]) => verifyBrowserOtp(...args),
}));
vi.mock("@/components/auth/AuthCard", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/auth/ApexLandingLink", () => ({
  ApexLandingLink: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/Logo", () => ({
  DubGridLogo: () => null,
  DubGridWordmark: () => null,
}));

describe("AuthVerifyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    verifyBrowserOtp.mockResolvedValue({ error: null });
  });

  it("does not consume a recovery token until Continue is clicked", async () => {
    searchParams = new URLSearchParams(
      "token_hash=recovery-token&type=recovery&next=/reset-password",
    );
    render(<AuthVerifyPage />);

    expect(verifyBrowserOtp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(verifyBrowserOtp).toHaveBeenCalledWith({
        type: "recovery",
        token_hash: "recovery-token",
      });
    });
    expect(replace).toHaveBeenCalledWith("/reset-password");
  });

  it("uses the fixed recovery destination instead of an external next value", async () => {
    searchParams = new URLSearchParams(
      "token_hash=recovery-token&type=recovery&next=https://evil.example",
    );
    render(<AuthVerifyPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reset-password"));
  });

  it("rejects unsupported action types without consuming their token", () => {
    searchParams = new URLSearchParams("token_hash=signup-token&type=signup&next=/reset-password");
    render(<AuthVerifyPage />);

    expect(screen.getByRole("heading", { name: "Invalid or expired link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(verifyBrowserOtp).not.toHaveBeenCalled();
  });
});
