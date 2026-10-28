import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ApiResponseError } from "@dubgrid/api-client";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

let hook: typeof import("./useFocusAreaShiftsQuestion");

beforeAll(async () => {
  hook = await import("./useFocusAreaShiftsQuestion");
});

const refusal = new ApiResponseError("Choose", 409, {
  code: "FOCUS_AREA_SHIFTS_DECISION",
  error: "Choose whether to clear or keep their 2 upcoming shifts in East Wing.",
  focusAreaShifts: [
    {
      focusAreaId: 5,
      focusAreaName: "East Wing",
      count: 2,
      firstDate: "2026-11-03",
      lastDate: "2026-11-05",
    },
  ],
});

function Harness({
  save,
  done,
  self = false,
  beforeAsk,
}: {
  save: (decision?: string) => Promise<string>;
  done: (result: unknown) => void;
  self?: boolean;
  beforeAsk?: () => void;
}) {
  const question = hook.useFocusAreaShiftsQuestion();
  return (
    <>
      <button
        onClick={() =>
          question
            .saveAsking("Mina Diaz", save, { self, beforeAsk })
            .then(done, (error: unknown) => done(error))
        }
      >
        Save
      </button>
      {question.modal}
    </>
  );
}

function start(options: { self?: boolean; beforeAsk?: () => void } = {}) {
  const save = vi.fn(async (decision?: string) => {
    if (!decision) throw refusal;
    return `saved:${decision}`;
  });
  const done = vi.fn();
  render(<Harness done={done} save={save} {...options} />);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  return { save, done };
}

describe("useFocusAreaShiftsQuestion (mobile)", () => {
  it("asks with the shifts and their dates, then sends the save again with the answer", async () => {
    const beforeAsk = vi.fn();
    const { save, done } = start({ beforeAsk });

    const dialog = within(await screen.findByRole("alert"));
    expect(beforeAsk).toHaveBeenCalledTimes(1);
    expect(dialog.getByText("Clear Mina Diaz's upcoming shifts in East Wing?")).toBeInTheDocument();
    expect(
      dialog.getByText("They have 2 upcoming shifts in East Wing, Tue, Nov 3 to Thu, Nov 5."),
    ).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Keep shifts" }));

    await waitFor(() => expect(done).toHaveBeenCalledWith("saved:keep"));
    expect(save).toHaveBeenLastCalledWith("keep");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears on Clear shifts", async () => {
    const { done } = start();
    fireEvent.click(
      within(await screen.findByRole("alert")).getByRole("button", { name: "Clear shifts" }),
    );
    await waitFor(() => expect(done).toHaveBeenCalledWith("saved:clear"));
  });

  it("saves nothing more when the question is closed", async () => {
    const { save, done } = start();
    fireEvent.click(
      within(await screen.findByRole("alert")).getByRole("button", { name: "Close" }),
    );
    await waitFor(() =>
      expect(done).toHaveBeenCalledWith(expect.any(hook.FocusAreaShiftsCancelledError)),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("speaks to you on your own record", async () => {
    start({ self: true });
    expect(
      within(await screen.findByRole("alert")).getByText(
        "Clear your upcoming shifts in East Wing?",
      ),
    ).toBeInTheDocument();
  });

  it("passes any other failure through", async () => {
    const failure = new Error("offline");
    const done = vi.fn();
    render(<Harness done={done} save={() => Promise.reject(failure)} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(failure));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
