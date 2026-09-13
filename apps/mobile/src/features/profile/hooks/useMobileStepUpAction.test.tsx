import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readMobileStepUpContext = vi.hoisted(() => vi.fn());
const confirmMobileStepUp = vi.hoisted(() => vi.fn());
const getMobileStepUpMethod = vi.hoisted(() => vi.fn());
const getMobileStepUpContextKey = vi.hoisted(() => vi.fn());
const useSessionState = vi.hoisted(() => vi.fn());

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
});
