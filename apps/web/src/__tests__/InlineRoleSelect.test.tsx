import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineRoleSelect } from "@/components/staff/InlineRoleSelect";

describe("InlineRoleSelect self-guard", () => {
  it("renders an editable role select for other people", () => {
    render(<InlineRoleSelect orgRole="admin" onChange={vi.fn()} />);
    // CustomSelect renders a listbox-trigger button.
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
  });

  it("renders a read-only badge (no editable control) for the current user", () => {
    render(<InlineRoleSelect orgRole="admin" onChange={vi.fn()} isSelf />);
    // The role label is shown, but no listbox trigger exists — you can't
    // change your own role.
    expect(screen.getByText(/admin/i)).toBeTruthy();
    expect(screen.queryByRole("button", { expanded: false })).toBeNull();
  });
});
