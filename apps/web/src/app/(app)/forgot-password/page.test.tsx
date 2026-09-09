import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "./page";

const resetBrowserPasswordForEmail = vi.fn();
const toastError = vi.fn();

vi.mock("@/features/account/client", () => ({
  resetBrowserPasswordForEmail: (...args: unknown[]) => resetBrowserPasswordForEmail(...args),
}));

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBrowserPasswordForEmail.mockResolvedValue({ error: null });
  });

  async function submit(email = "nurse@dubgrid.test") {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));
    });
  }

  it("uses the current origin reset route and confirms a successful request", async () => {
    render(<ForgotPasswordPage />);
    await submit();

    await waitFor(() => {
      expect(resetBrowserPasswordForEmail).toHaveBeenCalledWith(
        "nurse@dubgrid.test",
        `${window.location.origin}/reset-password`,
      );
    });
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  });

  it("shows the same neutral completion state when Supabase does not find an account", async () => {
    resetBrowserPasswordForEmail.mockResolvedValue({
      error: { message: "User not found", status: 400 },
    });

    render(<ForgotPasswordPage />);
    await submit();

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
  });

  it("keeps the request form available after a rate limit", async () => {
    resetBrowserPasswordForEmail.mockResolvedValue({
      error: { message: "over_email_send_rate_limit", status: 429 },
    });

    render(<ForgotPasswordPage />);
    await submit();

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Too many requests. Wait a few minutes and try again.",
      );
    });
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeEnabled();
  });

  it("keeps the request form available after a transport failure", async () => {
    resetBrowserPasswordForEmail.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<ForgotPasswordPage />);
    await submit();

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "We couldn't reach DubGrid. Check your connection and try again.",
      );
    });
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeEnabled();
  });

  it("settles a timeout without clearing the email", async () => {
    resetBrowserPasswordForEmail.mockRejectedValue(
      Object.assign(new Error("late"), { name: "RequestTimeoutError" }),
    );

    render(<ForgotPasswordPage />);
    await submit();

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "That took too long. Check your connection and try again.",
      );
    });
    expect(screen.getByLabelText("Email")).toHaveValue("nurse@dubgrid.test");
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeEnabled();
  });

  it("does not start a second reset request while the first is pending", () => {
    resetBrowserPasswordForEmail.mockReturnValue(new Promise(() => {}));

    render(<ForgotPasswordPage />);
    const input = screen.getByLabelText("Email");
    fireEvent.change(input, { target: { value: "nurse@dubgrid.test" } });
    const form = input.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(resetBrowserPasswordForEmail).toHaveBeenCalledTimes(1);
  });
});
