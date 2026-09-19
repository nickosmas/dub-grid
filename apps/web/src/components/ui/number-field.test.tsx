import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NumberField } from "./number-field";

function RequiredHarness({
  initial = 20,
  min = 0,
  max = 999,
  emptyValue,
  onChange,
}: {
  initial?: number;
  min?: number;
  max?: number;
  emptyValue?: number;
  onChange?: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberField
        aria-label="Minimum staff"
        min={min}
        max={max}
        emptyValue={emptyValue}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <output data-testid="value">{value}</output>
      <button type="button" onClick={() => setValue(2)}>
        Discard
      </button>
    </>
  );
}

function NullableHarness({ onChange }: { onChange?: (value: number | null) => void }) {
  const [value, setValue] = useState<number | null>(30);
  return (
    <>
      <NumberField
        nullable
        aria-label="Break"
        min={0}
        max={480}
        placeholder="None"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <output data-testid="value">{value === null ? "null" : value}</output>
    </>
  );
}

describe("NumberField", () => {
  it("can be cleared completely and retyped", async () => {
    const user = userEvent.setup();
    render(<RequiredHarness />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    await user.clear(field);
    expect(field).toHaveValue("");
    expect(screen.getByTestId("value")).toHaveTextContent("20");

    await user.type(field, "15");
    expect(field).toHaveValue("15");
    expect(screen.getByTestId("value")).toHaveTextContent("15");
  });

  it("restores the previous value when a required field is left blank", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RequiredHarness onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    await user.clear(field);
    await user.tab();

    expect(field).toHaveValue("20");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits emptyValue when a blank required field is left", async () => {
    const user = userEvent.setup();
    render(<RequiredHarness emptyValue={0} />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    await user.clear(field);
    await user.tab();

    expect(field).toHaveValue("0");
    expect(screen.getByTestId("value")).toHaveTextContent("0");
  });

  it("emits null for a cleared nullable field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NullableHarness onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Break" });

    await user.clear(field);
    expect(onChange).toHaveBeenLastCalledWith(null);
    await user.tab();

    expect(field).toHaveValue("");
    expect(screen.getByTestId("value")).toHaveTextContent("null");
  });

  it("ignores non-digit characters, including pasted separators", async () => {
    const user = userEvent.setup();
    render(<RequiredHarness />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    await user.clear(field);
    await user.type(field, "1e5-.,+3");
    expect(field).toHaveValue("153");

    await user.clear(field);
    await user.paste("1,200");
    expect(field).toHaveValue("1200");
  });

  it("clamps to the range and drops leading zeros on blur", async () => {
    const user = userEvent.setup();
    render(<RequiredHarness max={999} />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    await user.clear(field);
    await user.type(field, "1500");
    expect(field).toHaveValue("1500");
    expect(screen.getByTestId("value")).toHaveTextContent("999");
    await user.tab();
    expect(field).toHaveValue("999");

    await user.click(field);
    await user.clear(field);
    await user.type(field, "007");
    await user.tab();
    expect(field).toHaveValue("7");
  });

  it("follows an external value change without re-filling a cleared field", async () => {
    const user = userEvent.setup();
    render(<RequiredHarness />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    await user.clear(field);
    await user.type(field, "3");
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(field).toHaveValue("2");
    expect(screen.getByTestId("value")).toHaveTextContent("2");
  });

  it("steps with the arrow keys inside the range", async () => {
    const user = userEvent.setup();
    render(<RequiredHarness initial={0} min={0} max={2} />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    await user.click(field);
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(field).toHaveValue("2");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(field).toHaveValue("0");
  });

  it("selects the whole value on focus so typing replaces it", async () => {
    const user = userEvent.setup();
    render(<RequiredHarness />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    await user.click(field);
    await user.keyboard("4");
    expect(field).toHaveValue("4");
  });

  it("steps with the chevrons, which stop at the range and leave focus in the field", async () => {
    const user = userEvent.setup();
    render(<RequiredHarness initial={1} min={0} max={2} />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });
    const up = screen.getByRole("button", { name: "Increase" });
    const down = screen.getByRole("button", { name: "Decrease" });

    await user.click(field);
    await user.click(up);
    expect(field).toHaveValue("2");
    expect(screen.getByTestId("value")).toHaveTextContent("2");
    expect(up).toBeDisabled();
    expect(field).toHaveFocus();

    await user.click(down);
    await user.click(down);
    expect(field).toHaveValue("0");
    expect(down).toBeDisabled();
    // The chevrons are pointer targets only; Tab order stays on the input.
    expect(up).toHaveAttribute("tabindex", "-1");
  });

  it("ignores the mouse wheel", () => {
    const onChange = vi.fn();
    render(<RequiredHarness initial={3} min={0} max={9} onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    field.focus();
    fireEvent.wheel(field, { deltaY: -120 });
    fireEvent.wheel(field, { deltaY: 120 });
    expect(field).toHaveValue("3");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("exposes the range and value to assistive technology", () => {
    render(<RequiredHarness initial={5} min={1} max={9} />);
    const field = screen.getByRole("spinbutton", { name: "Minimum staff" });

    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(field).toHaveAttribute("aria-valuemin", "1");
    expect(field).toHaveAttribute("aria-valuemax", "9");
    expect(field).toHaveAttribute("aria-valuenow", "5");
  });
});
