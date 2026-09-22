import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MFAVerify } from "./MFAVerify";
import { RequestTimeoutError } from "@/lib/fetch-with-timeout";

const listBrowserMfaFactors = vi.fn();
const verifyBrowserTotpEnrollment = vi.fn();
const setBrowserSession = vi.fn();

vi.mock("@/features/account/client", () => ({
  listBrowserMfaFactors: (...args: unknown[]) => listBrowserMfaFactors(...args),
  verifyBrowserTotpEnrollment: (...args: unknown[]) => verifyBrowserTotpEnrollment(...args),
  setBrowserSession: (...args: unknown[]) => setBrowserSession(...args),
}));

describe("MFAVerify recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBrowserMfaFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });
    verifyBrowserTotpEnrollment.mockResolvedValue({
      data: { access_token: "verified-token", refresh_token: "verified-refresh" },
      error: null,
    });
    setBrowserSession.mockResolvedValue(undefined);
  });

  async function enterCode() {
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled());
    return input;
  }

  it("retries factor discovery after a temporary failure", async () => {
    listBrowserMfaFactors
      .mockResolvedValueOnce({ data: { totp: [] }, error: { status: 503 } })
      .mockResolvedValueOnce({
        data: { totp: [{ id: "factor-1", status: "verified" }] },
        error: null,
      });
    render(<MFAVerify onVerified={vi.fn()} onCancel={vi.fn()} />);

    expect(
      await screen.findByText("DubGrid is temporarily unavailable. Please try again."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await enterCode();

    expect(listBrowserMfaFactors).toHaveBeenCalledTimes(2);
  });

  it("keeps the code and releases the button after a timeout", async () => {
    verifyBrowserTotpEnrollment.mockRejectedValue(new RequestTimeoutError(15_000));
    render(<MFAVerify onVerified={vi.fn()} onCancel={vi.fn()} />);
    const input = await enterCode();

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(
      await screen.findByText("That took too long. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(input).toHaveValue("123456");
    expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled();
  });

  it("keeps progress active through a delayed post-verification handoff", async () => {
    let finishHandoff: (() => void) | undefined;
    const onVerified = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishHandoff = resolve;
        }),
    );
    render(<MFAVerify onVerified={onVerified} onCancel={vi.fn()} />);
    const input = await enterCode();
    const form = input.closest("form")!;

    fireEvent.submit(form);
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Verify/ })).toBeDisabled();
    await act(async () => {
      finishHandoff?.();
    });
  });

  it("clears only a terminal invalid code and prevents repeated activation", async () => {
    let resolveVerification: ((value: { error: { status: number } }) => void) | undefined;
    verifyBrowserTotpEnrollment.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );
    render(<MFAVerify onVerified={vi.fn()} onCancel={vi.fn()} />);
    const input = await enterCode();
    const form = input.closest("form")!;

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(verifyBrowserTotpEnrollment).toHaveBeenCalledTimes(1);
    resolveVerification?.({ error: { status: 400 } });

    expect(
      await screen.findByText("Invalid verification code. Please try again."),
    ).toBeInTheDocument();
    expect(input).toHaveValue("");
  });
});

describe("MFAVerify session handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBrowserMfaFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });
    verifyBrowserTotpEnrollment.mockResolvedValue({
      data: { access_token: "verified-token", refresh_token: "verified-refresh" },
      error: null,
    });
    setBrowserSession.mockResolvedValue(undefined);
  });

  // The challenge is answered against Supabase from the browser, so the cookie
  // every Route Handler reads still carries the password-only token until this
  // write lands. Navigating first let the shell's requests ride the stale
  // cookie, which an enrolled account below aal2 is now refused.
  it("writes the verified session before handing control to the caller", async () => {
    const order: string[] = [];
    setBrowserSession.mockImplementation(async () => {
      order.push("setSession");
    });
    const onVerified = vi.fn(async () => {
      order.push("onVerified");
    });

    render(<MFAVerify onVerified={onVerified} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled());
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() => expect(onVerified).toHaveBeenCalled());
    expect(setBrowserSession).toHaveBeenCalledWith({
      access_token: "verified-token",
      refresh_token: "verified-refresh",
    });
    expect(order).toEqual(["setSession", "onVerified"]);
  });

  it("still hands over when the verification returns no session to write", async () => {
    verifyBrowserTotpEnrollment.mockResolvedValue({ data: null, error: null });
    const onVerified = vi.fn();

    render(<MFAVerify onVerified={onVerified} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled());
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() => expect(onVerified).toHaveBeenCalled());
    expect(setBrowserSession).not.toHaveBeenCalled();
  });
});
