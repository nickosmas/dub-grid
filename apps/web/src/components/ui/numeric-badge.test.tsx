import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NumericBadge } from "./numeric-badge";

describe("NumericBadge", () => {
  it.each([1, 26, 99])("renders %s as a pill with no shape switch", (count) => {
    render(<NumericBadge label={`${count} needed`} count={count} />);

    const badge = screen.getByLabelText(`${count} needed`);
    expect(badge).toHaveTextContent(String(count));
    expect(badge).toHaveAttribute("data-numeric-badge");
    expect(badge).not.toHaveAttribute("data-shape");
  });

  it("clamps at the shared maximum", () => {
    render(<NumericBadge label="unread" count={100} />);

    expect(screen.getByLabelText("unread")).toHaveTextContent("99+");
  });

  it("clamps at a bell's maximum of 9", () => {
    render(<NumericBadge label="unread" count={10} max={9} />);

    expect(screen.getByLabelText("unread")).toHaveTextContent("9+");
  });

  it("renders nothing for a zero count", () => {
    const { container } = render(<NumericBadge label="unread" count={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("exposes the label, size, and tone", () => {
    render(<NumericBadge label="3 unread alerts" count={3} size="sm" tone="danger" />);

    const badge = screen.getByLabelText("3 unread alerts");
    expect(badge).toHaveAttribute("data-size", "sm");
    expect(badge).toHaveAttribute("data-tone", "danger");
  });

  it("defaults to the inline size and neutral tone", () => {
    render(<NumericBadge label="count" count={5} />);

    const badge = screen.getByLabelText("count");
    expect(badge).toHaveAttribute("data-size", "md");
    expect(badge).toHaveAttribute("data-tone", "neutral");
  });
});
