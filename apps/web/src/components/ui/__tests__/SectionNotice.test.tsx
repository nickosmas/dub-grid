import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionNotice } from "@/components/ui/SectionNotice";

describe("SectionNotice", () => {
  it("carries a removal warning on the danger surface", () => {
    render(
      <SectionNotice
        messages={["Saving now removes them from the schedule. They'll keep management access."]}
      />,
    );

    const callout = screen.getByRole("note");
    expect(callout).toHaveTextContent(/saving now removes them/i);
    // The caution glyph rides on currentColor, so it is only ever right if it
    // is actually inside the toned container.
    expect(callout.querySelector("svg")).toBeInTheDocument();
    expect(callout).toHaveClass(
      "border-[var(--dg-color-danger-border)]",
      "bg-[var(--dg-color-danger-bg)]",
      "text-[var(--dg-color-danger-text)]",
    );
  });

  it("uses the warning surface for something that will not happen", () => {
    render(
      <SectionNotice messages={["Saving now removes them from the schedule."]} tone="warning" />,
    );

    expect(screen.getByRole("note")).toHaveClass(
      "border-[var(--dg-color-warning-border)]",
      "bg-[var(--dg-color-warning-bg)]",
      "text-[var(--dg-color-warning-text)]",
    );
  });

  // The point of taking a list: a section raises one box however many things
  // it has to say, so two consequences can never render as two stacked boxes.
  it("keeps several messages inside a single box", () => {
    render(<SectionNotice messages={["First consequence.", "Second consequence."]} />);

    const callouts = screen.getAllByRole("note");
    expect(callouts).toHaveLength(1);
    expect(callouts[0]).toHaveTextContent("First consequence.");
    expect(callouts[0]).toHaveTextContent("Second consequence.");
    expect(callouts[0].querySelectorAll("svg")).toHaveLength(1);
  });

  it("renders nothing when there is nothing to say", () => {
    const { container } = render(<SectionNotice messages={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
