import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotFoundBoundary } from "./RouteBoundary";

vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href} data-client-link="true">
      {children}
    </a>
  ),
}));

describe("NotFoundBoundary navigation", () => {
  it("uses document navigation for the cross-subdomain home destination", () => {
    render(<NotFoundBoundary />);
    const link = screen.getByRole("link", { name: "Go Home" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).not.toHaveAttribute("data-client-link");
  });

  it("retains client navigation for an application destination", () => {
    render(<NotFoundBoundary backHref="/schedule" backLabel="Back to schedule" />);
    expect(screen.getByRole("link", { name: "Back to schedule" })).toHaveAttribute(
      "data-client-link",
      "true",
    );
  });
});
