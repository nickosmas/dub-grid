import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RequestTimeoutError } from "@/lib/fetch-with-timeout";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MFASetup } from "@/components/profile/MFASetup";

const mockListFactors = vi.fn();
const mockStartEnrollment = vi.fn();
const mockVerifyEnrollment = vi.fn();
const mockDisableFactor = vi.fn();
const mockUpdateMfaStatus = vi.fn();
const mockReauthenticate = vi.fn();
const mockCleanup = vi.fn();

vi.mock("@/features/account/client", () => ({
  BROWSER_TOTP_FRIENDLY_NAME: "DubGrid Authenticator",
  listBrowserMfaFactors: () => mockListFactors(),
  startBrowserTotpEnrollment: () => mockStartEnrollment(),
  verifyBrowserTotpEnrollment: (...args: unknown[]) => mockVerifyEnrollment(...args),
  disableBrowserMfaFactor: (...args: unknown[]) => mockDisableFactor(...args),
  updateMfaStatus: (...args: unknown[]) => mockUpdateMfaStatus(...args),
  reauthenticateBrowserMfa: (...args: unknown[]) => mockReauthenticate(...args),
  cleanupBrowserMfaFactor: (...args: unknown[]) => mockCleanup(...args),
  getBrowserAuthSession: async () => ({ access_token: "promoted-session" }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// auth-js prepends the data URI itself before handing `qr_code` back, so this
// is the real shape: an SVG document already addressable as an image source.
// The component must pass it through untouched -- re-encoding it would break
// the QR, and this is the payload a fix should be written against.
const QR_CODE = `data:image/svg+xml;utf-8,<?xml version="1.0"?>\n<svg width="231" height="231" xmlns="http://www.w3.org/2000/svg"><rect x="12" y="12" width="3" height="3" style="fill:black;stroke:none" /></svg>\n`;

const SECRET = "JVPHITUEBVW76FV4MNWGXCNOXQYM5FR4";

async function startEnrollment() {
  render(<MFASetup mfaEnabled={false} onStatusChange={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: /enable 2fa/i }));
  await confirmPassword();
  return screen.findByAltText(/scan this qr code/i);
}

async function confirmPassword() {
  await userEvent.type(screen.getByLabelText("Password"), "test-password");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}

/** The shape supabase-js throws: an AuthError carrying a stable `code`. */
function authError(message: string, code: string, status: number) {
  return Object.assign(new Error(message), { code, status, __isAuthError: true });
}

describe("MFASetup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockListFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
    mockStartEnrollment.mockResolvedValue({
      data: {
        id: "factor-1",
        totp: { qr_code: QR_CODE, secret: SECRET, uri: "otpauth://totp/DubGrid:a@b" },
      },
      error: null,
    });
    mockDisableFactor.mockResolvedValue({ error: null });
    mockUpdateMfaStatus.mockResolvedValue({ profile: { mfa_enabled: true } });
    mockReauthenticate.mockResolvedValue({ access_token: "password-session" });
    mockCleanup.mockResolvedValue(undefined);
    mockVerifyEnrollment.mockResolvedValue({
      data: { access_token: "promoted-session" },
      error: null,
    });
  });

  it("uses the enrollment QR exactly as supabase-js returns it", async () => {
    const img = await startEnrollment();
    expect(img.getAttribute("src")).toBe(QR_CODE.trimEnd());
  });

  it("shows the matching secret for manual entry", async () => {
    await startEnrollment();
    expect(screen.getByText(SECRET)).toBeInTheDocument();
  });

  it("unenrolls an unfinished factor when the setup component unmounts", async () => {
    const { unmount } = render(<MFASetup mfaEnabled={false} onStatusChange={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /enable 2fa/i }));
    await confirmPassword();
    await screen.findByAltText(/scan this qr code/i);
    unmount();

    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(mockCleanup).toHaveBeenCalledWith("factor-1");
  });

  it("names both causes when the authenticator's code is rejected", async () => {
    await startEnrollment();
    mockVerifyEnrollment.mockResolvedValue({
      error: authError("Invalid TOTP code entered", "mfa_verification_failed", 422),
    });

    await userEvent.type(screen.getByPlaceholderText("000000"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));

    const message = await screen.findByText(/didn't match/i);
    expect(message).toHaveTextContent(/delete the older DubGrid entry/i);
    expect(message).toHaveTextContent(/clock/i);
  });

  it("does not report a missing factor as a bad code", async () => {
    await startEnrollment();
    mockVerifyEnrollment.mockResolvedValue({
      error: authError("Factor not found", "mfa_factor_not_found", 404),
    });

    await userEvent.type(screen.getByPlaceholderText("000000"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));

    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
    expect(screen.queryByText(/didn't match/i)).not.toBeInTheDocument();
  });

  it("surfaces an unrelated failure instead of blaming the code", async () => {
    await startEnrollment();
    mockVerifyEnrollment.mockResolvedValue({
      data: { access_token: "promoted-session" },
      error: null,
    });
    mockUpdateMfaStatus.mockRejectedValue(
      new Error("We couldn't update two-factor authentication. Try again."),
    );

    await userEvent.type(screen.getByPlaceholderText("000000"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));

    expect(
      await screen.findByText(/couldn't update two-factor authentication/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/didn't match/i)).not.toBeInTheDocument();
  });

  it("does not remove a verified factor when persisting its status fails", async () => {
    const { unmount } = render(<MFASetup mfaEnabled={false} onStatusChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /enable 2fa/i }));
    await confirmPassword();
    await screen.findByAltText(/scan this qr code/i);
    mockVerifyEnrollment.mockResolvedValue({
      data: { access_token: "promoted-session" },
      error: null,
    });
    mockUpdateMfaStatus.mockRejectedValue(new Error("Status write failed"));

    await userEvent.type(screen.getByPlaceholderText("000000"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));
    await screen.findByText(/status write failed/i);
    unmount();

    expect(mockDisableFactor).not.toHaveBeenCalled();
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it("does not enroll after a cancelled or incorrect password", async () => {
    render(<MFASetup mfaEnabled={false} onStatusChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockReauthenticate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));
    mockReauthenticate.mockRejectedValue(new Error("Password could not be confirmed"));
    await confirmPassword();
    expect(await screen.findByRole("alert")).toHaveTextContent("Password could not be confirmed");
    expect(mockStartEnrollment).not.toHaveBeenCalled();
  });

  it("retries status with the promoted token without replaying verification", async () => {
    await startEnrollment();
    mockUpdateMfaStatus.mockRejectedValueOnce(new Error("Status unavailable"));
    await userEvent.type(screen.getByPlaceholderText("000000"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(mockUpdateMfaStatus).toHaveBeenLastCalledWith("promoted-session");
    expect(mockVerifyEnrollment).toHaveBeenCalledTimes(1);
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it("requires a successful fresh challenge before removal and uses live status", async () => {
    const onStatusChange = vi.fn();
    mockListFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });
    render(<MFASetup mfaEnabled onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    expect(screen.getByRole("button", { name: "Disable 2FA" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Authenticator code"), "123456");
    mockVerifyEnrollment.mockResolvedValueOnce({ error: new Error("Wrong code") });
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    expect(mockDisableFactor).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Authenticator code")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Disable 2FA" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Authenticator code"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    expect(mockDisableFactor).toHaveBeenCalledWith("factor-1", "promoted-session");
    // Another verified factor may exist: do not optimistically claim disabled.
    expect(onStatusChange).toHaveBeenCalledWith(true);
  });

  it("does not clean up an outcome-unknown verification after a timeout", async () => {
    await startEnrollment();
    mockVerifyEnrollment.mockRejectedValue(new RequestTimeoutError(15_000));
    await userEvent.type(screen.getByPlaceholderText("000000"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));
    await screen.findByRole("button", { name: "Refresh status" });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(mockDisableFactor).not.toHaveBeenCalled();
  });

  it("does not race verification with unmount cleanup", async () => {
    const { unmount } = render(<MFASetup mfaEnabled={false} onStatusChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));
    await confirmPassword();
    await screen.findByAltText(/scan this qr code/i);
    let finish!: (value: unknown) => void;
    mockVerifyEnrollment.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await userEvent.type(screen.getByPlaceholderText("000000"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    unmount();
    expect(mockCleanup).not.toHaveBeenCalled();
    await act(async () => finish({ data: { access_token: "promoted-session" }, error: null }));
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(mockUpdateMfaStatus).toHaveBeenCalledWith("promoted-session");
  });

  it("clears a rejected password and keeps the error attached to its field", async () => {
    render(<MFASetup mfaEnabled={false} onStatusChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));
    mockReauthenticate.mockRejectedValueOnce(new Error("Password could not be confirmed"));
    await confirmPassword();
    const field = screen.getByLabelText("Password");
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Password could not be confirmed");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(mockStartEnrollment).not.toHaveBeenCalled();
  });

  it("latches enrollment submission and blocks cancellation while proof is pending", async () => {
    let finish!: (value: unknown) => void;
    mockReauthenticate.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<MFASetup mfaEnabled={false} onStatusChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));
    const field = screen.getByLabelText("Password");
    fireEvent.change(field, { target: { value: "test-password" } });
    const form = field.closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(mockReauthenticate).toHaveBeenCalledOnce());
    expect(field).toHaveValue("");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(mockStartEnrollment).not.toHaveBeenCalled();
    await act(async () => finish({ access_token: "password-session" }));
    await screen.findByAltText(/scan this qr code/i);
    expect(mockStartEnrollment).toHaveBeenCalledOnce();
  });

  it("cancelling removal discards the code without touching factors", async () => {
    render(<MFASetup mfaEnabled onStatusChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    await userEvent.type(screen.getByLabelText("Authenticator code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    expect(screen.getByLabelText("Authenticator code")).toHaveValue("");
    expect(mockVerifyEnrollment).not.toHaveBeenCalled();
    expect(mockDisableFactor).not.toHaveBeenCalled();
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it("reconciles after an ambiguous removal timeout without asking for or replaying another code", async () => {
    mockListFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });
    mockDisableFactor.mockRejectedValueOnce(new RequestTimeoutError(15_000));
    render(<MFASetup mfaEnabled onStatusChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    await userEvent.type(screen.getByLabelText("Authenticator code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    await screen.findByRole("button", { name: "Refresh status" });
    expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(mockVerifyEnrollment).toHaveBeenCalledOnce();
    expect(mockDisableFactor).toHaveBeenCalledExactlyOnceWith("factor-1", "promoted-session");
    expect(mockUpdateMfaStatus).toHaveBeenCalledWith("promoted-session");
    expect(mockCleanup).not.toHaveBeenCalled();
  });
});
