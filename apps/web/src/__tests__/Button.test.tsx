import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { Button } from "@/components/Button";
import { Form } from "@/components/Form";

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

  it("shows a spinner and the progressive label while the action runs", async () => {
    const gate = deferred();
    render(
      <Button loadingLabel="Publishing" onClick={() => gate.promise}>
        Publish
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Publish" });
    expect(button).not.toHaveAttribute("aria-busy");

    await act(async () => {
      fireEvent.click(button);
    });

    // The label is never dropped for the spinner: a busy button still says
    // which action is running.
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByText("Publishing")).toBeInTheDocument();
    expect(screen.queryByText("Publish")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    expect(screen.getByText("Publish")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the same spinner for a pending flag that lives outside the button", () => {
    render(
      <Button loading loadingLabel="Deleting" onClick={vi.fn()}>
        Delete
      </Button>,
    );
    expect(screen.getByText("Deleting")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("still shows a spinner without a loadingLabel, keeping the label as-is", async () => {
    const gate = deferred();
    render(<Button onClick={() => gate.promise}>Open</Button>);
    const button = screen.getByRole("button", { name: /Open/ });
    await act(async () => {
      fireEvent.click(button);
    });

    // Most handlers arrive as props typed `=> void`, so the spinner cannot
    // wait for someone to remember `loadingLabel`: it is the default, and the
    // label survives rather than being swapped to a verb nobody supplied.
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("can opt out of the spinner for a row of content", async () => {
    const gate = deferred();
    render(
      <Button spinner={false} onClick={() => gate.promise}>
        A whole notification row
      </Button>,
    );
    const button = screen.getByRole("button", { name: /notification row/ });
    await act(async () => {
      fireEvent.click(button);
    });

    // A spinner wedged beside a row of text reads as breakage; the row still
    // latches and disables, and its own state change is the feedback.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(button).toBeDisabled();

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
  });
});

describe("Form", () => {
  it("submits once when submitted twice", async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    const onSubmit = vi.fn((e: React.FormEvent) => {
      e.preventDefault();
      return gate;
    });

    render(
      <Form onSubmit={onSubmit}>
        <button type="submit">Sign in</button>
      </Form>,
    );

    // A `type="submit"` button has no onClick, so `<Button>` cannot help here:
    // the work starts from the form's own submit event.
    const form = screen.getByRole("button", { name: "Sign in" }).closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve();
      await gate;
    });
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
