import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { UnderlineTabs, underlineTabPanelProps } from "./underline-tabs";

type Section = "account" | "schedule" | "requests" | "activity";

const ITEMS = [
  { value: "account" as const, label: "Account" },
  { value: "schedule" as const, label: "Schedule" },
  { value: "requests" as const, label: "Requests", count: 2 },
  { value: "activity" as const, label: "Activity" },
];

function Harness({ onChange }: { onChange?: (value: Section) => void }) {
  const [value, setValue] = useState<Section>("account");
  return (
    <>
      <UnderlineTabs<Section>
        aria-label="Person sections"
        idPrefix="person"
        items={ITEMS}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <section {...underlineTabPanelProps("person", value)}>{value} content</section>
    </>
  );
}

describe("UnderlineTabs", () => {
  it("marks the chosen tab and ties it to its panel", () => {
    render(<Harness />);

    const tabs = screen.getAllByRole("tab");
    expect(screen.getByRole("tablist", { name: "Person sections" })).toBeInTheDocument();
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Account");
    expect(tabs[0]).toHaveAttribute("aria-controls", "person-panel-account");
  });

  it("chooses a tab on click", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole("tab", { name: /Schedule/ }));

    expect(onChange).toHaveBeenCalledWith("schedule");
    expect(screen.getByRole("tab", { name: /Schedule/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("schedule content");
  });

  it("shows a count only where there is one", () => {
    render(<Harness />);

    expect(screen.getByLabelText("2 waiting")).toHaveTextContent("2");
    expect(screen.getAllByLabelText(/waiting/)).toHaveLength(1);
  });

  it("keeps only the chosen tab in the tab order", () => {
    render(<Harness />);

    expect(screen.getAllByRole("tab").map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it("moves with the arrow keys, wrapping, and to either end with Home and End", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist");
    const selected = () => screen.getByRole("tab", { selected: true });

    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(selected()).toHaveTextContent("Schedule");
    expect(selected()).toHaveFocus();

    fireEvent.keyDown(list, { key: "End" });
    expect(selected()).toHaveTextContent("Activity");

    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(selected()).toHaveTextContent("Account");

    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(selected()).toHaveTextContent("Activity");

    fireEvent.keyDown(list, { key: "Home" });
    expect(selected()).toHaveTextContent("Account");
    expect(selected()).toHaveFocus();
  });

  it("ignores other keys", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowDown" });

    expect(onChange).not.toHaveBeenCalled();
  });
});
