import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MfaNagBanner from "./MfaNagBanner";

let pathname = "/dashboard";
let section: string | null = null;
let billingLocked = false;

vi.mock("@/hooks", () => ({
  usePermissions: () => ({
    mfaNagRequired: true,
    isSuperAdmin: true,
    isGridmaster: false,
    isImpersonating: false,
    orgId: "org-1",
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(section ? { section } : undefined),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { billingAccess: { isLocked: billingLocked } },
    isLoading: false,
  }),
}));

describe("MfaNagBanner", () => {
  beforeEach(() => {
    sessionStorage.clear();
    pathname = "/dashboard";
    section = null;
    billingLocked = false;
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

  it("hides the warning while a Super Admin is confined to billing recovery", () => {
    pathname = "/settings";
    section = "org-billing";
    billingLocked = true;

    render(<MfaNagBanner />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the warning on an unlocked billing page", async () => {
    pathname = "/settings";
    section = "org-billing";

    render(<MfaNagBanner />);

    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});
