import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarMenuButton, SidebarMenuSubButton, SidebarProvider } from "./sidebar";

function renderSidebar(children: React.ReactNode) {
  return render(<SidebarProvider>{children}</SidebarProvider>);
}

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
});
