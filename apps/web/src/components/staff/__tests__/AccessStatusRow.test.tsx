import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccessStatusRow } from "@/components/staff/AccessStatusRow";

describe("AccessStatusRow", () => {
  it("emphasizes consequential notes with minimal warning copy", () => {
    render(
      <AccessStatusRow
        label="Wings"
        statusText="Not scheduled"
        tone="neutral"
        note="Saving now removes them from the schedule. They'll keep management access."
      />,
    );

    const callout = screen.getByRole("note", { name: "Wings: Not scheduled" });
    expect(callout).toHaveClass(
      "border-[var(--dg-color-border-light)]",
      "bg-[var(--dg-color-bg-secondary)]",
    );
    expect(screen.getByText("Not scheduled")).toHaveClass("text-[14px]", "font-semibold");
    expect(screen.getByText(/saving now removes them/i)).toHaveClass(
      "text-[13px]",
      "font-medium",
      "text-[var(--dg-color-danger)]",
    );
  });

  it("keeps ordinary access summaries on the quiet neutral treatment", () => {
    const { container } = render(
      <AccessStatusRow label="Wings" statusText="Scheduled — 2 wings" tone="active" />,
    );

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass(
      "border-[var(--dg-color-border-light)]",
      "bg-[var(--dg-color-bg-secondary)]",
    );
    expect(screen.getByText("Scheduled — 2 wings")).toHaveClass("text-[13px]", "font-medium");
  });
});
