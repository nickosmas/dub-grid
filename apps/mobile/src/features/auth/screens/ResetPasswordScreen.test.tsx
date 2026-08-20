import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

const routerReplace = vi.fn();
const pushToast = vi.fn();

const verifyOtp = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const resetPasswordForEmail = vi.fn();
const createEphemeralSupabaseClient = vi.fn();
const getSupabaseClient = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    Redirect: ({ href }: { href: string }) => React.createElement("div", {}, `redirect:${href}`),
    router: { replace: routerReplace, push: vi.fn() },
    useLocalSearchParams: () => ({ email: "nurse@dubgrid.test" }),
  };
});

vi.mock("../../../shared/lib/supabase", () => ({
  createEphemeralSupabaseClient: () => createEphemeralSupabaseClient(),
  getSupabaseClient: () => getSupabaseClient(),
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast }),
}));

vi.mock("@expo/vector-icons/Ionicons", async () => {
  const React = await import("react");
  return { default: () => React.createElement("i") };
});

let ResetPasswordScreen: (typeof import("./ResetPasswordScreen"))["default"];

beforeAll(async () => {
  ResetPasswordScreen = (await import("./ResetPasswordScreen")).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  verifyOtp.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
  signOut.mockResolvedValue({ error: null });
  resetPasswordForEmail.mockResolvedValue({ error: null });
  createEphemeralSupabaseClient.mockReturnValue({
    auth: { verifyOtp, updateUser, signOut, resetPasswordForEmail },
  });
});

async function enterCode(value = "123456") {
  fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value } });
  await act(async () => {
    fireEvent.click(screen.getByText("Verify code"));
  });
}

describe("ResetPasswordScreen", () => {
  /**
   * The regression guard for the whole flow. `verifyOtp({type:"recovery"})`
   * returns a real session; on the persistent client that lands in SecureStore,
   * AuthSessionProvider picks it up, and LoginScreen redirects the user into
   * the tab tree mid-reset with no organization session behind it.
   */
  it("never touches the persistent Supabase client", async () => {
    render(<ResetPasswordScreen />);
    await enterCode();

    expect(createEphemeralSupabaseClient).toHaveBeenCalled();
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it("verifies the code as a recovery OTP for the passed email", async () => {
    render(<ResetPasswordScreen />);
    await enterCode();

    expect(verifyOtp).toHaveBeenCalledWith({
      email: "nurse@dubgrid.test",
      token: "123456",
      type: "recovery",
    });
  });

  it("advances to the password stage once the code is accepted", async () => {
    render(<ResetPasswordScreen />);
    await enterCode();

    expect(await screen.findByText("Set a new password")).toBeInTheDocument();
  });

  it("explains an expired code instead of surfacing Supabase's wording", async () => {
    verifyOtp.mockResolvedValue({
      error: { code: "otp_expired", message: "Token has expired or is invalid" },
    });

    render(<ResetPasswordScreen />);
    await enterCode();

    expect(
      screen.getByText("That code has expired or isn't right. Request a new one."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Token has expired/)).not.toBeInTheDocument();
  });

  it("rejects a code that is not six digits without calling the API", async () => {
    render(<ResetPasswordScreen />);
    await enterCode("123");

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the 6-digit code from your email.")).toBeInTheDocument();
  });

  it("strips non-digits from the code field", async () => {
    render(<ResetPasswordScreen />);
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "12ab34" } });

    expect((input as HTMLInputElement).value).toBe("1234");
  });

  it("updates the password, revokes other sessions, then returns to sign in", async () => {
    render(<ResetPasswordScreen />);
    await enterCode();

    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Str0ng!Passphrase" },
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Update password"));
    });

    expect(updateUser).toHaveBeenCalledWith({ password: "Str0ng!Passphrase" });
    // Global, not local: a reset usually means the old password leaked, so any
    // session still holding it has to go.
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  // The warning has to land while typing. Previously it only appeared after
  // pressing Update, so the user learned about it by wasting a tap.
  it("warns about a mismatch as the user types, before any submit", async () => {
    render(<ResetPasswordScreen />);
    await enterCode();

    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Str0ng!Diff" },
    });

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("stays quiet until the confirmation has been typed", async () => {
    render(<ResetPasswordScreen />);
    await enterCode();

    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });

    expect(screen.queryByText("Passwords do not match.")).not.toBeInTheDocument();
  });

  it("clears the warning once the passwords agree", async () => {
    render(<ResetPasswordScreen />);
    await enterCode();

    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    const confirm = screen.getByPlaceholderText("Confirm password");
    fireEvent.change(confirm, { target: { value: "Str0ng!Diff" } });
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();

    fireEvent.change(confirm, { target: { value: "Str0ng!Passphrase" } });
    expect(screen.queryByText("Passwords do not match.")).not.toBeInTheDocument();
  });

  it("disables the submit while the passwords differ", async () => {
    render(<ResetPasswordScreen />);
    await enterCode();

    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Str0ng!Diff" },
    });

    const submit = screen.getByRole("button", { name: "Update password" });
    expect(submit).toBeDisabled();

    await act(async () => {
      fireEvent.click(submit);
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("disables the submit for a password below the shared strength bar", async () => {
    render(<ResetPasswordScreen />);
    await enterCode();

    // Long enough for the old web bar (>= 10 chars) but only strength level 1,
    // which the shared `isPasswordAcceptable` rejects.
    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "aaaaaaaaaa" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "aaaaaaaaaa" },
    });

    const submit = screen.getByRole("button", { name: "Update password" });
    expect(submit).toBeDisabled();

    await act(async () => {
      fireEvent.click(submit);
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("starts the resend action on cooldown", () => {
    render(<ResetPasswordScreen />);
    expect(screen.getByText("Resend code in 60s")).toBeInTheDocument();
  });

  /**
   * `resetPasswordForEmail` resolves with `{ error }` rather than throwing, so
   * ignoring the return value told the user "We sent a new code." for a resend
   * the server had actually rejected.
   */
  it("surfaces a rejected resend instead of claiming a code was sent", async () => {
    vi.useFakeTimers();
    try {
      render(<ResetPasswordScreen />);

      // One act per tick: the cooldown reschedules its timer from an effect, so
      // React has to commit each decrement before the next one is scheduled.
      for (let i = 0; i < 60; i++) {
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });
      }

      resetPasswordForEmail.mockResolvedValue({
        error: { status: 429, message: "over_email_send_rate_limit" },
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Resend code"));
      });

      expect(pushToast).not.toHaveBeenCalled();
      expect(
        screen.getByText("Too many requests. Wait a few minutes and try again."),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
