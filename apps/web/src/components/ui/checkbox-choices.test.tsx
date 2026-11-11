import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckboxChoices } from "./checkbox-choices";

const ITEMS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
] as const;

describe("CheckboxChoices", () => {
  it("ticks each chosen value", () => {
    render(
      <CheckboxChoices
        aria-label="Access role"
        items={[...ITEMS]}
        value={["admin", "user"]}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("group", { name: "Access role" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Super Admin" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Admin" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "User" })).toBeChecked();
  });

  it("adds a choice in list order, whatever order it was ticked in", () => {
    const onChange = vi.fn();
    render(
      <CheckboxChoices
        aria-label="Access role"
        items={[...ITEMS]}
        value={["user"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Super Admin" }));

    expect(onChange).toHaveBeenCalledWith(["super_admin", "user"]);
  });

  it("removes a ticked choice and leaves the others", () => {
    const onChange = vi.fn();
    render(
      <CheckboxChoices
        aria-label="Access role"
        items={[...ITEMS]}
        value={["admin", "user"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Admin" }));

    expect(onChange).toHaveBeenCalledWith(["user"]);
  });

  it("works with numeric ids", () => {
    const onChange = vi.fn();
    render(
      <CheckboxChoices
        aria-label="Wings"
        items={[
          { value: 1, label: "Skilled Nursing" },
          { value: 2, label: "Sheltered Care" },
        ]}
        value={[2]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Skilled Nursing" }));

    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });

  it("reads out a count and leaves out a zero one", () => {
    render(
      <CheckboxChoices
        aria-label="Invitation"
        items={[
          { value: "has_access", label: "Has access", count: 0 },
          { value: "pending", label: "Invitation pending", count: 3, countLabel: "3 pending" },
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByLabelText("3 pending")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });
});
