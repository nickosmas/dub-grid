import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "./status-pill";

describe("StatusPill", () => {
  it("keeps the existing status treatment as the default", () => {
    const { container } = render(<StatusPill tone="success">Active</StatusPill>);
    const pill = screen.getByText("Active");

    expect(pill.className).toContain("rounded-md");
    expect(pill.className).toContain("font-medium");
    expect(pill.getAttribute("style")).toContain("background: var(--dg-color-success-bg)");
    expect(pill.getAttribute("style")).toContain("color: var(--dg-color-success-text)");
    expect(pill.getAttribute("style")).toContain(
      "border: 1px solid var(--dg-color-success-border)",
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("matches the Activity Log category treatment without a default dot", () => {
    const { container } = render(
      <StatusPill tone="neutral" variant="category">
        Skilled Nursing
      </StatusPill>,
    );
    const pill = screen.getByText("Skilled Nursing");

    expect(pill.className).toContain("rounded-[4px]");
    expect(pill.className).toContain("font-semibold");
    expect(pill.className).toContain("text-[length:var(--dg-fs-footnote)]");
    expect(pill).toHaveAttribute("data-status-pill-variant", "category");
    expect(pill.getAttribute("style")).toContain("background: var(--dg-color-bg-secondary)");
    expect(pill.getAttribute("style")).toContain("color: var(--dg-color-text-label)");
    expect(pill.getAttribute("style")).toContain("border: 1px solid var(--dg-color-border)");
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
