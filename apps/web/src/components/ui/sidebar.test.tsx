import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarMenuButton, SidebarMenuSubButton, SidebarProvider, useSidebar } from "./sidebar";

const viewport = vi.hoisted(() => ({ isCompact: false, isMobile: false }));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => viewport.isMobile,
  useIsCompactScreen: () => viewport.isCompact,
}));

function renderSidebar(children: React.ReactNode) {
  return render(<SidebarProvider>{children}</SidebarProvider>);
}

function SidebarState() {
  const { setOpen, state } = useSidebar();
  return (
    <div>
      <output data-testid="sidebar-state">{state}</output>
      <button type="button" onClick={() => setOpen(true)}>
        Open sidebar
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Collapse sidebar
      </button>
    </div>
  );
}

afterEach(() => {
  viewport.isCompact = false;
  viewport.isMobile = false;
});

describe("sidebar active semantics", () => {
  it("marks an active link as the current page", () => {
    renderSidebar(
      <SidebarMenuButton isActive render={<a href="/settings" />}>
        Settings
      </SidebarMenuButton>,
    );

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  it("marks an active view button as pressed", () => {
    renderSidebar(<SidebarMenuButton isActive>Overview</SidebarMenuButton>);

    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("leaves inactive controls unselected", () => {
    renderSidebar(
      <>
        <SidebarMenuButton render={<a href="#people" />}>People</SidebarMenuButton>
        <SidebarMenuButton>Overview</SidebarMenuButton>
        <SidebarMenuSubButton render={<a href="/settings/profile" />}>Profile</SidebarMenuSubButton>
      </>,
    );

    expect(screen.getByRole("link", { name: "People" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Overview" })).not.toHaveAttribute("aria-pressed");
    expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current");
  });

  it("marks an active nested link as the current page", () => {
    renderSidebar(
      <SidebarMenuSubButton isActive render={<a href="/settings/profile" />}>
        Profile
      </SidebarMenuSubButton>,
    );

    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("distinguishes active items with weight instead of a left rail", () => {
    renderSidebar(
      <>
        <SidebarMenuButton isActive>Overview</SidebarMenuButton>
        <SidebarMenuSubButton isActive render={<a href="/settings/profile" />}>
          Profile
        </SidebarMenuSubButton>
      </>,
    );

    for (const item of [
      screen.getByRole("button", { name: "Overview" }),
      screen.getByRole("link", { name: "Profile" }),
    ]) {
      expect(item).toHaveClass("data-active:font-semibold");
      expect(item.className).not.toContain("before:");
    }
  });

  it("collapses an open shared sidebar when the viewport becomes compact", async () => {
    const { rerender } = render(
      <SidebarProvider defaultOpen>
        <SidebarState />
      </SidebarProvider>,
    );
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");

    viewport.isCompact = true;
    rerender(
      <SidebarProvider defaultOpen>
        <SidebarState />
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
    });

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");

    viewport.isCompact = false;
    rerender(
      <SidebarProvider defaultOpen>
        <SidebarState />
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");
    });
  });
});
