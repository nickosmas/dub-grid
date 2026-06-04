import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineRoleSelect } from "@/components/staff/InlineRoleSelect";

describe("InlineRoleSelect self-guard", () => {
  it("renders an editable role select for other people", () => {
    render(<InlineRoleSelect orgRole="admin" onChange={vi.fn()} />);
    // CustomSelect renders a listbox-trigger button.
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
  });

  it("renders a disabled dropdown (grayed) for the current user", () => {
    render(<InlineRoleSelect orgRole="admin" onChange={vi.fn()} isSelf />);
    // The dropdown still renders so the column reads consistently, but the
    // trigger is aria-disabled so the user can't change their own role.
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/admin/i)).toBeTruthy();
  });
});
