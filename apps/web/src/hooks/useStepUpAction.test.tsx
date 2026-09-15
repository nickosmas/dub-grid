import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStepUpAction } from "./useStepUpAction";

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), context: vi.fn() }));
vi.mock("@/features/account/client/step-up", async (load) => ({
  ...(await load<typeof import("@/features/account/client/step-up")>()),
  confirmBrowserStepUp: mocks.confirm,
  readStepUpContext: mocks.context,
}));
vi.mock("@/features/account/client/auth", () => ({}));

const required = (method = "password") =>
  Object.assign(new Error("Confirm identity"), {
    status: 403,
    code: "STEP_UP_REQUIRED",
    method,
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Harness({
  action,
  done = () => {},
  failed = () => {},
}: {
  action: (token: string) => Promise<unknown>;
  done?: (value: boolean) => void;
  failed?: (error: unknown) => void;
}) {
  const stepUp = useStepUpAction();
  return (
    <>
      <input aria-label="Pending details" defaultValue="Keep these edits" />
      <button
        onClick={() => {
          void stepUp.run(action).then(done, failed);
        }}
      >
        Sensitive action
      </button>
      {stepUp.dialog}
    </>
  );
}
async function start() {
  fireEvent.click(screen.getByRole("button", { name: "Sensitive action" }));
  await screen.findByRole("dialog", { name: "Confirm your identity" });
}
function submit(label = "Password", value = "test-password") {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("useStepUpAction", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({ key: "original-context", accessToken: "original-token" });
    mocks.confirm.mockResolvedValue("renewed-token");
  });

  it("executes an already-authorized action once without prompting", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const done = vi.fn();
    render(<Harness action={action} done={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Sensitive action" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(true));
    expect(action).toHaveBeenCalledExactlyOnceWith("original-token");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each(["password", "totp"])(
    "prompts for %s and retries once with the exact returned token",
    async (method) => {
      const action = vi.fn().mockRejectedValueOnce(required(method)).mockResolvedValue(undefined);
      const done = vi.fn();
      render(<Harness action={action} done={done} />);
      await start();
      submit(
        method === "password" ? "Password" : "Authenticator code",
        method === "password" ? "test-password" : "123456",
      );
      await waitFor(() => expect(done).toHaveBeenCalledWith(true));
      expect(action).toHaveBeenCalledTimes(2);
      expect(action).toHaveBeenLastCalledWith("renewed-token");
      expect(screen.getByLabelText("Pending details")).toHaveValue("Keep these edits");
    },
  );

  it("cancels without repeating the pending action or clearing its form", async () => {
    const action = vi.fn().mockRejectedValue(required());
    const done = vi.fn();
    render(<Harness action={action} done={done} />);
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(false));
    expect(action).toHaveBeenCalledOnce();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Pending details")).toHaveValue("Keep these edits");
  });

  it("keeps errors inline and clears credentials after a rejected proof", async () => {
    mocks.confirm.mockRejectedValueOnce(new Error("sensitive provider internals"));
    const action = vi.fn().mockRejectedValue(required());
    render(<Harness action={action} />);
    await start();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't confirm your identity");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByText("sensitive provider internals")).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledOnce();
  });

  it("blocks duplicate actions and submissions, plus dismissal during verification", async () => {
    const proof = deferred<string>();
    mocks.confirm.mockReturnValueOnce(proof.promise);
    const action = vi.fn().mockRejectedValueOnce(required()).mockResolvedValue(undefined);
    render(<Harness action={action} />);
    const trigger = screen.getByRole("button", { name: "Sensitive action" });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    await screen.findByLabelText("Password");
    submit();
    const form = screen.getByLabelText("Password").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => {
      proof.resolve("exact-token");
    });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });

  it("does not replay after unmount during verification", async () => {
    const proof = deferred<string>();
    mocks.confirm.mockReturnValueOnce(proof.promise);
    const action = vi.fn().mockRejectedValue(required());
    const done = vi.fn();
    const view = render(<Harness action={action} done={done} />);
    await start();
    submit();
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      proof.resolve("late-token");
    });
    expect(action).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledWith(false);
  });

  it.each(["before", "after"])(
    "cancels when the account or organization changes %s verification",
    async (when) => {
      const action = vi.fn().mockRejectedValue(required());
      const failed = vi.fn();
      render(<Harness action={action} failed={failed} />);
      await start();
      if (when === "after") mocks.context.mockResolvedValueOnce({ key: "original-context" });
      mocks.context.mockResolvedValue({ key: "different-context" });
      submit();
      await waitFor(() => expect(failed).toHaveBeenCalledOnce());
      expect(action).toHaveBeenCalledOnce();
      expect(mocks.confirm).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
    },
  );

  it("requires another explicit confirmation for expired proof or factor drift", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(required())
      .mockRejectedValueOnce(required("totp"))
      .mockResolvedValue(undefined);
    render(<Harness action={action} />);
    await start();
    submit();
    await screen.findByLabelText("Authenticator code");
    expect(action).toHaveBeenCalledTimes(2);
    expect(mocks.confirm).toHaveBeenCalledOnce();
    submit("Authenticator code", "654321");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
  });

  it("does not retry ambiguous mutation failures", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(required())
      .mockRejectedValueOnce(new Error("network interrupted"));
    const failed = vi.fn();
    render(<Harness action={action} failed={failed} />);
    await start();
    submit();
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("times out confirmation and ignores a late provider success", async () => {
    const proof = deferred<string>();
    mocks.confirm.mockReturnValueOnce(proof.promise);
    const action = vi.fn().mockRejectedValue(required());
    render(<Harness action={action} />);
    await start();
    vi.useFakeTimers();
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't confirm your identity");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      proof.resolve("late-token");
    });
    expect(action).toHaveBeenCalledOnce();
  });
});
