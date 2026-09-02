import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MfaNagBanner from "./MfaNagBanner";

vi.mock("@/hooks", () => ({
  usePermissions: () => ({ mfaNagRequired: true }),
}));

describe("MfaNagBanner", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("wraps and grows instead of clipping its controls on narrow screens", async () => {
    render(<MfaNagBanner />);

    const banner = await screen.findByRole("status");
    expect(banner).toHaveClass("min-h-9", "flex-wrap", "py-2");
    expect(banner.style.height).toBe("");
    expect(screen.getByRole("link", { name: "Set it up" })).toHaveAttribute(
      "href",
      "/profile?section=security",
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
