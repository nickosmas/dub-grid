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
const signOutMobileSessions = vi.fn();
const getAuthenticatorAssuranceLevel = vi.fn();
const listFactors = vi.fn();
const challengeAndVerify = vi.fn();

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

vi.mock("../../../shared/lib/api", () => ({
  signOutMobileSessions: (...args: unknown[]) => signOutMobileSessions(...args),
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
  verifyOtp.mockResolvedValue({
    data: { session: { access_token: "recovery-token" } },
    error: null,
  });
  signOutMobileSessions.mockResolvedValue({ success: true });
  updateUser.mockResolvedValue({ error: null });
  signOut.mockResolvedValue({ error: null });
  resetPasswordForEmail.mockResolvedValue({ error: null });
  getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  listFactors.mockResolvedValue({
    data: { totp: [{ id: "factor-1", status: "verified" }] },
    error: null,
  });
  challengeAndVerify.mockResolvedValue({ data: { access_token: "promoted-token" }, error: null });
  createEphemeralSupabaseClient.mockReturnValue({
    auth: {
      verifyOtp,
      updateUser,
      signOut,
      resetPasswordForEmail,
      mfa: { getAuthenticatorAssuranceLevel, listFactors, challengeAndVerify },
    },
  });
});

async function setNewPassword() {
  fireEvent.change(screen.getByPlaceholderText("New password"), {
    target: { value: "Str0ng!Passphrase" },
  });
  fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
    target: { value: "Str0ng!Passphrase" },
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Update password"));
  });
}

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

  it("keeps the code and releases verify after a provider deadline", async () => {
    vi.useFakeTimers();
    verifyOtp.mockReturnValue(new Promise(() => undefined));
    render(<ResetPasswordScreen />);

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Verify code"));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));

    expect(screen.getByPlaceholderText("000000")).toHaveValue("123456");
    expect(screen.getByRole("button", { name: "Verify code" })).toBeEnabled();
    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
  });

  it("does not duplicate code verification while it is active", async () => {
    let resolveVerification: ((value: { error: null }) => void) | undefined;
    verifyOtp.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );
    render(<ResetPasswordScreen />);

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Verify code"));
    fireEvent.click(screen.getByText("Verify code"));

    expect(verifyOtp).toHaveBeenCalledTimes(1);
    await act(async () => resolveVerification?.({ error: null }));
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

  it.each([
    ["a code for another account", "otp_expired"],
    ["an already-used code", "otp_expired"],
  ])("rejects %s without opening the password stage", async (_case, code) => {
    verifyOtp.mockResolvedValue({ error: { code, message: "private provider wording" } });

    render(<ResetPasswordScreen />);
    await enterCode();

    expect(screen.queryByText("Set a new password")).not.toBeInTheDocument();
    expect(
      screen.getByText("That code has expired or isn't right. Request a new one."),
    ).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
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
    // session still holding it has to go, in DubGrid as well as the provider.
    expect(signOutMobileSessions).toHaveBeenCalledWith("recovery-token", {
      scope: "global",
      reason: "password_recovery",
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(pushToast).toHaveBeenCalledWith({
      message: "Password updated. Sign in with your new password!",
      tone: "success",
    });
    expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("clears the ephemeral session and returns to sign in when global revocation fails", async () => {
    signOutMobileSessions.mockRejectedValue(new Error("private"));
    render(<ResetPasswordScreen />);
    await enterCode();

    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    await act(async () => fireEvent.click(screen.getByText("Update password")));

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(pushToast).toHaveBeenCalledWith({
      message: "Password updated. Sign in and review your active sessions.",
      tone: "info",
    });
    expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("keeps the verified recovery flow recoverable when the password update is rejected", async () => {
    updateUser.mockResolvedValue({ error: { code: "same_password", message: "same password" } });

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

    expect(screen.getAllByText("Choose a password you haven't used before.")).toHaveLength(2);
    expect(signOut).not.toHaveBeenCalled();
    expect(signOutMobileSessions).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  // A late provider success used to change the password with no revocation
  // behind it, while the screen offered a retry of a change that had landed.
  it("finishes the recovery instead of offering a retry when the update times out", async () => {
    vi.useFakeTimers();
    updateUser.mockReturnValue(new Promise(() => undefined));
    render(<ResetPasswordScreen />);
    await enterCode();

    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    fireEvent.click(screen.getByText("Update password"));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));

    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(signOutMobileSessions).toHaveBeenCalledWith("recovery-token", {
      scope: "global",
      reason: "password_recovery",
    });
    expect(pushToast).toHaveBeenCalledWith({
      message:
        "We couldn't confirm your new password. Try signing in with it. If it doesn't work, request a new code.",
      tone: "info",
    });
    expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
    vi.useRealTimers();
  });

  it("treats a lost response as a password change that may have landed", async () => {
    updateUser.mockRejectedValue(new TypeError("Network request failed"));
    render(<ResetPasswordScreen />);
    await enterCode();

    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    await act(async () => fireEvent.click(screen.getByText("Update password")));

    expect(signOutMobileSessions).toHaveBeenCalled();
    expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
    expect(screen.queryByText(/couldn't connect/i)).not.toBeInTheDocument();
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

  // Supabase refuses a new password from a two-factor account's recovery
  // session until its authenticator code promotes the session (41b2).
  describe("a two-factor account", () => {
    beforeEach(() => {
      getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: { currentLevel: "aal1", nextLevel: "aal2" },
        error: null,
      });
    });

    async function enterFactorCode(value = "654321") {
      fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value } });
      await act(async () => {
        fireEvent.click(screen.getByText("Verify authenticator code"));
      });
    }

    it("asks for the authenticator code, then signs out with the promoted session", async () => {
      render(<ResetPasswordScreen />);
      await enterCode();

      expect(await screen.findByText("Enter your authenticator code")).toBeInTheDocument();
      expect(screen.queryByText("Set a new password")).not.toBeInTheDocument();

      await enterFactorCode();
      expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-1", code: "654321" });
      expect(await screen.findByText("Set a new password")).toBeInTheDocument();

      await setNewPassword();
      expect(signOutMobileSessions).toHaveBeenCalledWith("promoted-token", {
        scope: "global",
        reason: "password_recovery",
      });
    });

    // Android keeps a reused field unmasked when keyboardType and
    // secureTextEntry change together, which showed the new password in
    // plain text in the 41d3 device rehearsal.
    it("mounts a fresh field for the new password", async () => {
      render(<ResetPasswordScreen />);
      await enterCode();
      await screen.findByText("Enter your authenticator code");
      const codeField = screen.getByLabelText("Authenticator code");

      await enterFactorCode();
      await screen.findByText("Set a new password");

      expect(screen.getByLabelText("New password")).not.toBe(codeField);
    });

    it("keeps the code step for a wrong authenticator code", async () => {
      challengeAndVerify.mockResolvedValue({
        data: null,
        error: Object.assign(new Error("Invalid TOTP code entered"), { status: 422 }),
      });
      render(<ResetPasswordScreen />);
      await enterCode();
      await enterFactorCode();

      expect(
        await screen.findByText(
          "That code didn't work. Check your authenticator app and try again.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Set a new password")).not.toBeInTheDocument();
    });

    it("points to support when the account has no usable authenticator", async () => {
      listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
      render(<ResetPasswordScreen />);
      await enterCode();

      expect(
        await screen.findByText(
          "We couldn't find an authenticator app on this account. Contact support for help.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Set a new password")).not.toBeInTheDocument();
    });

    it("signs the recovery session out from the no-authenticator stage", async () => {
      listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
      render(<ResetPasswordScreen />);
      await enterCode();
      await screen.findByText("We can't finish this reset");

      await act(async () => {
        fireEvent.click(screen.getByText("Back to sign in"));
      });

      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
    });

    // The emailed code is spent once it verifies, so a retry after a failed
    // lookup must not send it again (F-03).
    it("retries only the lookup when it fails after the code verified", async () => {
      getAuthenticatorAssuranceLevel.mockRejectedValueOnce(new TypeError("Network request failed"));
      render(<ResetPasswordScreen />);
      await enterCode();
      expect(screen.queryByText("Enter your authenticator code")).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByText("Verify code"));
      });

      expect(await screen.findByText("Enter your authenticator code")).toBeInTheDocument();
      expect(verifyOtp).toHaveBeenCalledTimes(1);
    });

    it("leaves at once even when the recovery sign-out never settles", async () => {
      signOut.mockReturnValue(new Promise(() => undefined));
      render(<ResetPasswordScreen />);
      await enterCode();
      await screen.findByText("Enter your authenticator code");

      await act(async () => {
        fireEvent.click(screen.getByText("Back to sign in"));
      });

      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
    });

    it("signs the recovery session out when the person backs out", async () => {
      render(<ResetPasswordScreen />);
      await enterCode();
      await screen.findByText("Enter your authenticator code");

      await act(async () => {
        fireEvent.click(screen.getByText("Back to sign in"));
      });

      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
      expect(updateUser).not.toHaveBeenCalled();
    });
  });

  it("goes to the authenticator step when the update is refused for its assurance level", async () => {
    updateUser.mockResolvedValue({
      error: Object.assign(new Error("AAL2 session is required"), {
        status: 401,
        code: "insufficient_aal",
      }),
    });
    render(<ResetPasswordScreen />);
    await enterCode();
    await setNewPassword();

    expect(await screen.findByText("Enter your authenticator code")).toBeInTheDocument();
    expect(signOutMobileSessions).not.toHaveBeenCalled();
  });
});
