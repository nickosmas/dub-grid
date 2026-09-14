import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NumericBadge } from "./numeric-badge";

describe("NumericBadge", () => {
  it.each([8, 98])("keeps the short value %s circular", (value) => {
    render(<NumericBadge aria-label={`${value} needed`} value={value} />);

    expect(screen.getByLabelText(`${value} needed`)).toHaveAttribute("data-shape", "circle");
  });

  it.each([100, "999+"])("widens the long value %s into a pill", (value) => {
    render(<NumericBadge aria-label={`${value} needed`} value={value} />);

    expect(screen.getByLabelText(`${value} needed`)).toHaveAttribute("data-shape", "pill");
  });
});
