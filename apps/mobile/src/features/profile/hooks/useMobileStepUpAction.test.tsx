import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readMobileStepUpContext = vi.hoisted(() => vi.fn());
const confirmMobileStepUp = vi.hoisted(() => vi.fn());
const getMobileStepUpMethod = vi.hoisted(() => vi.fn());
const getMobileStepUpContextKey = vi.hoisted(() => vi.fn());
const useSessionState = vi.hoisted(() => vi.fn());
const biometric = vi.hoisted(() => ({
  readSavedStepUpPassword: vi.fn(),
  saveStepUpPassword: vi.fn(),
  clearSavedStepUpPassword: vi.fn(),
  isRefusedSavedPassword: vi.fn(),
}));

vi.mock("../../../shared/lib/biometric-step-up", () => biometric);
vi.mock("../../../shared/lib/access-token", () => ({
  getUserIdFromAccessToken: (token: string) => `user-of-${token}`,
}));

vi.mock("../../../shared/providers/AuthSessionProvider", () => ({ useSessionState }));
vi.mock("../lib/step-up", () => ({
  readMobileStepUpContext,
  confirmMobileStepUp,
  getMobileStepUpMethod,
  getMobileStepUpContextKey,
}));
vi.mock("../components/MobileStepUpSheet", () => ({
  MobileStepUpSheet: ({
    method,
    error,
    onConfirm,
    onCancel,
  }: {
    method: "password" | "totp";
    error: string | null;
    onConfirm: (credential: string) => Promise<void>;
    onCancel: () => void;
  }) => (
    <div role="dialog">
      <span>{method}</span>
      {error ? <span role="alert">{error}</span> : null}
      <button onClick={() => void onConfirm(method === "password" ? "secret" : "123456")}>
        Confirm
      </button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

import { useMobileStepUpAction } from "./useMobileStepUpAction";

let action: ReturnType<typeof vi.fn>;

function Harness() {
  const stepUp = useMobileStepUpAction();
  return (
    <>
      <button onClick={() => void stepUp.run(action)}>Run action</button>
      {stepUp.sheet}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  action = vi.fn();
  useSessionState.mockReturnValue({ accessToken: "render-token" });
  readMobileStepUpContext.mockResolvedValue({ key: "user-1:org-1", accessToken: "old-token" });
  getMobileStepUpContextKey.mockReturnValue("user-1:org-1");
  getMobileStepUpMethod.mockImplementation((error: { method?: string }) => error?.method ?? null);
  biometric.readSavedStepUpPassword.mockResolvedValue(null);
  biometric.saveStepUpPassword.mockResolvedValue(undefined);
  biometric.clearSavedStepUpPassword.mockResolvedValue(undefined);
  biometric.isRefusedSavedPassword.mockImplementation(
    (error: { refused?: boolean }) => error?.refused === true,
  );
});

describe("useMobileStepUpAction", () => {
  it("retries the pending action once with the exact promoted token", async () => {
    action.mockRejectedValueOnce({ method: "totp" }).mockResolvedValueOnce({ success: true });
    confirmMobileStepUp.mockResolvedValue("aal2-token");
    render(<Harness />);

    fireEvent.click(screen.getByText("Run action"));
    expect(await screen.findByRole("dialog")).toHaveTextContent("totp");
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action).toHaveBeenNthCalledWith(1, "old-token");
    expect(action).toHaveBeenNthCalledWith(2, "aal2-token");
    expect(confirmMobileStepUp).toHaveBeenCalledWith("totp", "123456", "old-token");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("leaves the action pending after wrong proof and allows another attempt", async () => {
    action.mockRejectedValueOnce({ method: "password" }).mockResolvedValueOnce(undefined);
    confirmMobileStepUp
      .mockRejectedValueOnce(new Error("Wrong password"))
      .mockResolvedValueOnce("password-token");
    render(<Harness />);

    fireEvent.click(screen.getByText("Run action"));
    fireEvent.click(await screen.findByText("Confirm"));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't confirm your identity");
    expect(action).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action).toHaveBeenLastCalledWith("password-token");
  });

  it("cancels without retrying the action", async () => {
    action.mockRejectedValueOnce({ method: "totp" });
    render(<Harness />);

    fireEvent.click(screen.getByText("Run action"));
    fireEvent.click(await screen.findByText("Cancel"));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(1);
    expect(confirmMobileStepUp).not.toHaveBeenCalled();
  });

  it("abandons pending work when the account or organization changes", async () => {
    action.mockRejectedValueOnce({ method: "totp" });
    const view = render(<Harness />);

    fireEvent.click(screen.getByText("Run action"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    getMobileStepUpContextKey.mockReturnValue("user-1:org-2");
    useSessionState.mockReturnValue({ accessToken: "other-org-token" });
    await act(async () => view.rerender(<Harness />));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(1);
  });

  describe("with a password saved behind biometrics", () => {
    it("completes the action after biometrics, with no sheet", async () => {
      action.mockRejectedValueOnce({ method: "password" }).mockResolvedValueOnce(undefined);
      biometric.readSavedStepUpPassword.mockResolvedValue("saved-secret");
      confirmMobileStepUp.mockResolvedValue("password-token");
      let completed: boolean | undefined;
      function Runner() {
        const stepUp = useMobileStepUpAction();
        return (
          <>
            <button
              onClick={() =>
                void stepUp.run(action).then((result) => {
                  completed = result;
                })
              }
            >
              Run action
            </button>
            {stepUp.sheet}
          </>
        );
      }
      render(<Runner />);

      fireEvent.click(screen.getByText("Run action"));

      await waitFor(() => expect(completed).toBe(true));
      expect(biometric.readSavedStepUpPassword).toHaveBeenCalledWith(
        "password",
        "user-of-old-token",
      );
      expect(confirmMobileStepUp).toHaveBeenCalledWith("password", "saved-secret", "old-token");
      expect(action).toHaveBeenLastCalledWith("password-token");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(biometric.saveStepUpPassword).not.toHaveBeenCalled();
    });

    it("asks for the password when biometrics are cancelled or off", async () => {
      action.mockRejectedValueOnce({ method: "password" }).mockResolvedValueOnce(undefined);
      confirmMobileStepUp.mockResolvedValue("password-token");
      render(<Harness />);

      fireEvent.click(screen.getByText("Run action"));
      expect(await screen.findByRole("dialog")).toHaveTextContent("password");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(confirmMobileStepUp).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText("Confirm"));
      await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
      expect(biometric.saveStepUpPassword).toHaveBeenCalledWith("user-of-password-token", "secret");
    });

    it("deletes a saved password the server refuses and asks for it", async () => {
      action.mockRejectedValueOnce({ method: "password" });
      biometric.readSavedStepUpPassword.mockResolvedValue("old-secret");
      confirmMobileStepUp.mockRejectedValueOnce({ refused: true });
      render(<Harness />);

      fireEvent.click(screen.getByText("Run action"));

      expect(await screen.findByRole("alert")).toHaveTextContent("saved password no longer works");
      expect(biometric.clearSavedStepUpPassword).toHaveBeenCalled();
      expect(action).toHaveBeenCalledTimes(1);
    });

    it("keeps the saved password after a failure that doesn't prove it wrong", async () => {
      action.mockRejectedValueOnce({ method: "password" });
      biometric.readSavedStepUpPassword.mockResolvedValue("saved-secret");
      confirmMobileStepUp.mockRejectedValueOnce(new Error("Network request failed"));
      render(<Harness />);

      fireEvent.click(screen.getByText("Run action"));

      expect(await screen.findByRole("dialog")).toHaveTextContent("password");
      expect(biometric.clearSavedStepUpPassword).not.toHaveBeenCalled();
    });

    it("never tries biometrics for a two-factor code", async () => {
      action.mockRejectedValueOnce({ method: "totp" });
      biometric.readSavedStepUpPassword.mockResolvedValue("saved-secret");
      render(<Harness />);

      fireEvent.click(screen.getByText("Run action"));

      expect(await screen.findByRole("dialog")).toHaveTextContent("totp");
      expect(biometric.readSavedStepUpPassword).not.toHaveBeenCalled();
    });

    it("switches to the code sheet when the account now asks for one", async () => {
      action.mockRejectedValueOnce({ method: "password" });
      biometric.readSavedStepUpPassword.mockResolvedValue("saved-secret");
      confirmMobileStepUp.mockRejectedValueOnce({ method: "totp" });
      render(<Harness />);

      fireEvent.click(screen.getByText("Run action"));

      expect(await screen.findByRole("dialog")).toHaveTextContent("totp");
      expect(biometric.clearSavedStepUpPassword).not.toHaveBeenCalled();
    });

    it("drops the action when the account changes during the biometric check", async () => {
      action.mockRejectedValueOnce({ method: "password" });
      biometric.readSavedStepUpPassword.mockResolvedValue("saved-secret");
      readMobileStepUpContext
        .mockResolvedValueOnce({ key: "user-1:org-1", accessToken: "old-token" })
        .mockResolvedValueOnce({ key: "user-1:org-2", accessToken: "other-token" });
      render(<Harness />);

      fireEvent.click(screen.getByText("Run action"));

      await waitFor(() => expect(readMobileStepUpContext).toHaveBeenCalledTimes(2));
      expect(confirmMobileStepUp).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(action).toHaveBeenCalledTimes(1);
    });
  });
});
