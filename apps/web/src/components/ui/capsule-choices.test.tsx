import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CapsuleChoices } from "./capsule-choices";

const ITEMS = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admin" },
  { value: "pending", label: "Pending", count: 3, countLabel: "3 pending" },
] as const;

describe("CapsuleChoices", () => {
  it("marks only the chosen capsule pressed and reports a new choice", () => {
    const onChange = vi.fn();
    render(
      <CapsuleChoices
        aria-label="Access role"
        items={[...ITEMS]}
        value="admin"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("group", { name: "Access role" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Admin" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("names a count for screen readers and leaves out a zero", () => {
    const { rerender } = render(
      <CapsuleChoices aria-label="Invitation" items={[...ITEMS]} value="all" onChange={() => {}} />,
    );
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByLabelText("3 pending")).toBeTruthy();

    rerender(
      <CapsuleChoices
        aria-label="Invitation"
        items={[{ value: "pending", label: "Pending", count: 0 }]}
        value="pending"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("0")).toBeNull();
  });
});
