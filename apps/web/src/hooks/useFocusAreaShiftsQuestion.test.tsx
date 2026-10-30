import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FocusAreaUpcomingShifts } from "@dubgrid/domain";
import { useFocusAreaShiftsQuestion } from "./useFocusAreaShiftsQuestion";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const eastWing: FocusAreaUpcomingShifts = {
  focusAreaId: 2,
  focusAreaName: "East Wing",
  count: 3,
  firstDate: "2026-11-03",
  lastDate: "2026-11-20",
};

function Harness({ done }: { done: (answer: string | null) => void }) {
  const question = useFocusAreaShiftsQuestion();
  const options = question.optionsFor("Barbara Trent");
  return (
    <>
      <button onClick={() => void options.askFocusAreaShifts!([eastWing]).then(done)}>Save</button>
      <button onClick={() => options.onFocusAreaShiftsNotCleared!("Not cleared.")}>Fail</button>
      {question.dialog}
    </>
  );
}

async function ask() {
  const done = vi.fn();
  render(<Harness done={done} />);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alertdialog", {
    name: "Clear Barbara Trent's upcoming shifts in East Wing?",
  });
  return done;
}

describe("useFocusAreaShiftsQuestion", () => {
  it("names the shifts and their dates, and what clearing does", async () => {
    await ask();
    expect(
      screen.getByText("They have 3 upcoming shifts in East Wing, Tue, Nov 3 to Fri, Nov 20."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cleared shifts come off in the draft and leave the schedule when it's published.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Open requests for those shifts are closed.")).toBeInTheDocument();
  });

  it.each([
    ["Clear shifts", "clear"],
    ["Keep shifts", "keep"],
    ["Cancel", null],
  ])("answers %s with %s and closes", async (label, expected) => {
    const done = await ask();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(expected));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tells the manager when the clear didn't go through", () => {
    render(<Harness done={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Fail" }));
    expect(toastError).toHaveBeenCalledWith("Not cleared.");
  });
});
