import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSharedStepUp } from "./useSharedStepUp";

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), context: vi.fn() }));
vi.mock("@/features/account/client/step-up", async (load) => ({
  ...(await load<typeof import("@/features/account/client/step-up")>()),
  confirmBrowserStepUp: mocks.confirm,
  readStepUpContext: mocks.context,
}));
vi.mock("@/features/account/client/auth", () => ({}));

const required = () =>
  Object.assign(new Error("Confirm identity"), {
    status: 403,
    code: "STEP_UP_REQUIRED",
    method: "password",
  });

type Action = (token?: string) => Promise<unknown>;

function Harness({ actions, done }: { actions: Action[]; done: (results: boolean[]) => void }) {
  const stepUp = useSharedStepUp();
  return (
    <>
      <button
        onClick={() => {
          void Promise.all(actions.map((action) => stepUp.run(action))).then(done);
        }}
      >
        Deactivate
      </button>
      {stepUp.dialog}
    </>
  );
}

function refusedUntilAssured() {
  return vi.fn(async (token?: string) => {
    if (token !== "renewed-token") throw required();
  });
}

async function confirmIdentity() {
  await screen.findByRole("dialog", { name: "Confirm your identity" });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("useSharedStepUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({ key: "context", accessToken: "current-token" });
    mocks.confirm.mockResolvedValue("renewed-token");
  });

  it("runs an action the server accepts once, with no prompt", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const done = vi.fn();
    render(<Harness actions={[action]} done={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(done).toHaveBeenCalledWith([true]));
    expect(action).toHaveBeenCalledExactlyOnceWith();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("prompts on a refusal and retries with the assured token", async () => {
    const action = refusedUntilAssured();
    const done = vi.fn();
    render(<Harness actions={[action]} done={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await confirmIdentity();

    await waitFor(() => expect(done).toHaveBeenCalledWith([true]));
    expect(action).toHaveBeenLastCalledWith("renewed-token");
  });

  it("covers every refusal in a batch with one prompt", async () => {
    const first = refusedUntilAssured();
    const second = refusedUntilAssured();
    const done = vi.fn();
    render(<Harness actions={[first, second]} done={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await confirmIdentity();

    await waitFor(() => expect(done).toHaveBeenCalledWith([true, true]));
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(first).toHaveBeenLastCalledWith("renewed-token");
    expect(second).toHaveBeenLastCalledWith("renewed-token");
  });

  it("resolves false for the whole batch when the prompt is cancelled", async () => {
    const first = refusedUntilAssured();
    const second = refusedUntilAssured();
    const done = vi.fn();
    render(<Harness actions={[first, second]} done={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await screen.findByRole("dialog", { name: "Confirm your identity" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(done).toHaveBeenCalledWith([false, false]));
    expect(second).toHaveBeenCalledOnce();
  });

  it("passes any other failure to the caller without prompting", async () => {
    const action = vi.fn().mockRejectedValue(new Error("db unavailable"));
    let failure: unknown;
    function Failing() {
      const stepUp = useSharedStepUp();
      return (
        <button
          onClick={() => {
            stepUp.run(action).catch((error: unknown) => {
              failure = error;
            });
          }}
        >
          Deactivate
        </button>
      );
    }
    render(<Failing />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(failure).toEqual(new Error("db unavailable")));
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
