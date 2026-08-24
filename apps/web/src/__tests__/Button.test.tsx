import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { Button } from "@/components/Button";

/** A promise plus the handle to settle it, so a test can hold work in flight. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("Button", () => {
  it("runs an async action once, however many times it is clicked", async () => {
    const gate = deferred();
    const onClick = vi.fn(() => gate.promise);

    render(<Button onClick={onClick}>Publish</Button>);
    const button = screen.getByRole("button", { name: "Publish" });

    // Two clicks in the same tick, which is what an impatient double-click is.
    // Nothing has re-rendered in between, so a `disabled` driven by state would
    // not have reached the DOM yet.
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(onClick).toHaveBeenCalledTimes(1);

    // Still latched while the first call is in flight.
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    // ...and released once it settles.
    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("is not fooled by a useState busy flag, which is why the latch is a ref", async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);

    // The guard this component ships is exactly the one found across the app
    // before the latch existed: a state flag driving `disabled`. On its own it
    // does not survive two clicks in one tick.
    function StateGuarded() {
      const [busy, setBusy] = useState(false);
      return (
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void action().finally(() => setBusy(false));
          }}
        >
          Publish
        </button>
      );
    }

    render(<StateGuarded />);
    const button = screen.getByRole("button", { name: "Publish" });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    // Two executions: this is the bug the latch exists to prevent.
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("leaves a synchronous handler alone", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Close</Button>);
    const button = screen.getByRole("button", { name: "Close" });

    fireEvent.click(button);
    fireEvent.click(button);

    // Nothing to double-execute, so nothing is swallowed.
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(button).not.toBeDisabled();
  });

  it("keeps the caller's own disabled state", () => {
    render(
      <Button disabled onClick={vi.fn()}>
        Save
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("passes className and type through to the native button", () => {
    render(
      <Button className="dg-btn dg-btn-primary" type="submit" onClick={vi.fn()}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("dg-btn", "dg-btn-primary");
    expect(button).toHaveAttribute("type", "submit");
  });
});
