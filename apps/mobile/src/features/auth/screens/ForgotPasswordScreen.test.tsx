import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

const routerReplace = vi.fn();
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

vi.mock("@expo/vector-icons/Ionicons", async () => {
  const React = await import("react");
  return { default: () => React.createElement("i") };
});

let ForgotPasswordScreen: (typeof import("./ForgotPasswordScreen"))["default"];

beforeAll(async () => {
  ForgotPasswordScreen = (await import("./ForgotPasswordScreen")).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  resetPasswordForEmail.mockResolvedValue({ error: null });
  createEphemeralSupabaseClient.mockReturnValue({ auth: { resetPasswordForEmail } });
});

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByText("Send reset code"));
  });
}

describe("ForgotPasswordScreen", () => {
  it("prefills the email carried over from sign-in", () => {
    render(<ForgotPasswordScreen />);
    expect((screen.getByPlaceholderText("Email") as HTMLInputElement).value).toBe(
      "nurse@dubgrid.test",
    );
  });

  it("requests a reset for the entered address", async () => {
    render(<ForgotPasswordScreen />);
    await submit();

    expect(resetPasswordForEmail).toHaveBeenCalledWith("nurse@dubgrid.test");
  });

  it("uses the ephemeral client, never the persistent one", async () => {
    render(<ForgotPasswordScreen />);
    await submit();

    expect(createEphemeralSupabaseClient).toHaveBeenCalled();
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it("advances to the reset screen carrying the email", async () => {
    render(<ForgotPasswordScreen />);
    await submit();

    expect(routerReplace).toHaveBeenCalledWith({
      pathname: "/(auth)/reset-password",
      params: { email: "nurse@dubgrid.test" },
    });
  });

  /**
   * Anti-enumeration: a screen that says "no account with that email" is a way
   * to discover which addresses are registered. The web forgot-password page
   * takes the same position.
   */
  /**
   * These mock a *resolved* `{ error }`, which is what supabase-js actually
   * does — it only throws for a transport-level failure. Mocking a rejection
   * instead hid a bug where every one of these errors was swallowed and the
   * user was advanced to wait for an email that had never been sent.
   */
  it("advances even when the address has no account", async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { message: "User not found", status: 400 },
    });

    render(<ForgotPasswordScreen />);
    await submit();

    expect(routerReplace).toHaveBeenCalled();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });

  it("surfaces rate limiting inline instead of advancing", async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { status: 429, message: "over_email_send_rate_limit" },
    });

    render(<ForgotPasswordScreen />);
    await submit();

    expect(routerReplace).not.toHaveBeenCalled();
    expect(
      screen.getByText("Too many requests. Wait a few minutes and try again."),
    ).toBeInTheDocument();
  });

  it("surfaces a network failure inline instead of advancing", async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { message: "Failed to fetch", status: 0 },
    });

    render(<ForgotPasswordScreen />);
    await submit();

    expect(routerReplace).not.toHaveBeenCalled();
    expect(
      screen.getByText("We couldn't connect right now. Check your connection and try again."),
    ).toBeInTheDocument();
  });

  it("surfaces a thrown transport failure inline instead of advancing", async () => {
    resetPasswordForEmail.mockRejectedValue(new TypeError("Network request failed"));

    render(<ForgotPasswordScreen />);
    await submit();

    expect(routerReplace).not.toHaveBeenCalled();
    expect(
      screen.getByText("We couldn't connect right now. Check your connection and try again."),
    ).toBeInTheDocument();
  });

  it("rejects a malformed address without calling the API", async () => {
    render(<ForgotPasswordScreen />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "not-an-email" } });
    await submit();

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
  });
});
