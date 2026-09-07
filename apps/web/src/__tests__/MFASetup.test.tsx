import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MFASetup } from "@/components/profile/MFASetup";

const mockListFactors = vi.fn();
const mockStartEnrollment = vi.fn();
const mockVerifyEnrollment = vi.fn();
const mockDisableFactor = vi.fn();
const mockUpdateMfaStatus = vi.fn();

vi.mock("@/features/account/client", () => ({
  BROWSER_TOTP_FRIENDLY_NAME: "DubGrid Authenticator",
  listBrowserMfaFactors: () => mockListFactors(),
  startBrowserTotpEnrollment: () => mockStartEnrollment(),
  verifyBrowserTotpEnrollment: (...args: unknown[]) => mockVerifyEnrollment(...args),
  disableBrowserMfaFactor: (...args: unknown[]) => mockDisableFactor(...args),
  updateMfaStatus: (...args: unknown[]) => mockUpdateMfaStatus(...args),
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
  return screen.findByAltText(/scan this qr code/i);
}

/** The shape supabase-js throws: an AuthError carrying a stable `code`. */
function authError(message: string, code: string, status: number) {
  return Object.assign(new Error(message), { code, status, __isAuthError: true });
}

describe("MFASetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
    mockStartEnrollment.mockResolvedValue({
      data: {
        id: "factor-1",
        totp: { qr_code: QR_CODE, secret: SECRET, uri: "otpauth://totp/DubGrid:a@b" },
      },
      error: null,
    });
    mockDisableFactor.mockResolvedValue({ error: null });
    mockUpdateMfaStatus.mockResolvedValue(undefined);
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
    await screen.findByAltText(/scan this qr code/i);
    unmount();

    expect(mockDisableFactor).toHaveBeenCalledTimes(1);
    expect(mockDisableFactor).toHaveBeenCalledWith("factor-1");
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
    mockVerifyEnrollment.mockResolvedValue({ error: null });
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
    await screen.findByAltText(/scan this qr code/i);
    mockVerifyEnrollment.mockResolvedValue({ error: null });
    mockUpdateMfaStatus.mockRejectedValue(new Error("Status write failed"));

    await userEvent.type(screen.getByPlaceholderText("000000"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));
    await screen.findByText(/status write failed/i);
    unmount();

    expect(mockDisableFactor).not.toHaveBeenCalled();
  });
});
