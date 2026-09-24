import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GoodbyePage from "./page";

vi.mock("@/components/auth/AuthCard", () => ({
  PageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("./RunLogoutTeardown", () => ({ RunLogoutTeardown: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href} data-client-link="true">
      {children}
    </a>
  ),
}));

describe("GoodbyePage navigation", () => {
  it("uses document navigation for its cross-subdomain home link", async () => {
    render(await GoodbyePage({ searchParams: Promise.resolve({}) }));
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/");
    expect(link).not.toHaveAttribute("data-client-link");
  });
});
