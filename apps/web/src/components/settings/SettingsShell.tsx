"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import { useMediaQuery, MOBILE, TABLET } from "@/hooks";
import { useSetMobileSubNav, SubNavItem } from "@/components/MobileSubNavContext";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import type { NavIconComponent } from "./nav-config";

export interface ShellNavItem<TId extends string = string> {
  id: TId;
  label: string;
  Icon: NavIconComponent;
  description?: string;
}

export interface ShellNavGroup<TId extends string = string> {
  id: string;
  label: string;
  items: ShellNavItem<TId>[];
}

export interface SettingsShellProps<TId extends string = string> {
  /** URL base for sidebar links — e.g. "/settings" or "/account". */
  basePath: string;
  /** Permission-filtered nav groups, in render order. */
  navGroups: ShellNavGroup<TId>[];
  /** Group IDs that pin to the sidebar footer instead of scrolling. */
  footerGroupIds?: string[];
  /** Section to load when the URL has no `?section=` param. */
  defaultSection: TId;
  /** The active section ID — usually resolved upstream from the URL. */
  activeSection: TId;
  /** Content max-width for the active section. Defaults to 1120. */
  maxWidth?: number;
  /** Optional banner above the active panel (e.g. permission notice). */
  banner?: React.ReactNode;
  /** The active panel itself. Caller owns the switch on activeSection. */
  children: React.ReactNode;
}

/**
 * Shared chrome for any settings-style page: collapsible sidebar with
 * grouped nav, a page-title header, an optional banner, and a content slot.
 * Used by both `/settings` (org-scoped) and `/account` (user-scoped).
 */
export function SettingsShell<TId extends string = string>({
  basePath,
  navGroups,
  footerGroupIds = [],
  defaultSection,
  activeSection,
  maxWidth = 1120,
  banner,
  children,
}: SettingsShellProps<TId>) {
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);

  const contentGroups = useMemo(
    () => navGroups.filter((g) => !footerGroupIds.includes(g.id)),
    [navGroups, footerGroupIds],
  );
  const footerGroups = useMemo(
    () => navGroups.filter((g) => footerGroupIds.includes(g.id)),
    [navGroups, footerGroupIds],
  );

  const allItems = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);
  const activeItem = allItems.find((i) => i.id === activeSection);

  const hrefFor = useCallback(
    (id: TId) => (id === defaultSection ? basePath : `${basePath}?section=${id}`),
    [basePath, defaultSection],
  );

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("dg-sidebar-manual-collapse") !== "true";
  });
  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    localStorage.setItem("dg-sidebar-manual-collapse", String(!open));
  }, []);

  // Register sub-nav items for the mobile bottom sheet (with group labels).
  const subNavItems: SubNavItem[] = useMemo(
    () =>
      navGroups.flatMap((group) =>
        group.items.map((item) => {
          const isActive = activeSection === item.id;
          return {
            id: item.id,
            label: item.label,
            icon: <item.Icon />,
            href: hrefFor(item.id),
            active: isActive,
            group: group.label,
          };
        }),
      ),
    [navGroups, activeSection, hrefFor],
  );
  useSetMobileSubNav(subNavItems);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          height: "calc(100dvh - var(--header-height))",
          width: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {!isMobile && (
          <Sidebar
            data-tour="settings-sidebar"
            collapsible="icon"
            className="border-r border-[var(--dg-color-border)] bg-[var(--dg-color-surface)]"
            style={{
              top: "var(--header-height)",
              height: "calc(100dvh - var(--header-height))",
            }}
          >
            <SidebarContent className="pt-2 overscroll-contain">
              {contentGroups.map((group) => (
                <SidebarGroup key={group.id}>
                  <SidebarGroupLabel className="text-[10px] font-bold tracking-[0.08em] uppercase text-[var(--dg-color-text-faint)] px-3 pb-0">
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const isActive = activeSection === item.id;
                        return (
                          <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                              render={<Link href={hrefFor(item.id)} replace />}
                              isActive={isActive}
                              tooltip={item.label}
                              className="h-9 data-[active=true]:bg-[var(--dg-color-nav-active-bg)] data-[active=true]:text-[var(--dg-color-text-primary)] transition-all ease-in-out duration-150"
                            >
                              <span
                                className={
                                  isActive
                                    ? "text-[var(--dg-color-text-primary)] flex shrink-0 items-center justify-center transition-colors"
                                    : "text-[var(--dg-color-text-faint)] flex shrink-0 items-center justify-center transition-colors"
                                }
                              >
                                <item.Icon />
                              </span>
                              <span className="font-semibold">{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
            <SidebarFooter>
              {footerGroups.length > 0 && (
                <div className="-mx-2 border-t border-[var(--dg-color-border)]" />
              )}
              {footerGroups.map((group) => (
                <SidebarGroup key={group.id} className="p-0">
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const isActive = activeSection === item.id;
                        return (
                          <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                              render={<Link href={hrefFor(item.id)} replace />}
                              isActive={isActive}
                              tooltip={item.label}
                              className="h-9 data-[active=true]:bg-[var(--dg-color-nav-active-bg)] data-[active=true]:text-[var(--dg-color-text-primary)] transition-all ease-in-out duration-150"
                            >
                              <span
                                className={
                                  isActive
                                    ? "text-[var(--dg-color-text-primary)] flex shrink-0 items-center justify-center transition-colors"
                                    : "text-[var(--dg-color-text-faint)] flex shrink-0 items-center justify-center transition-colors"
                                }
                              >
                                <item.Icon />
                              </span>
                              <span className="font-semibold">{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleSidebarOpenChange(!sidebarOpen)}
                    tooltip={sidebarOpen ? "Collapse Menu" : "Expand Menu"}
                    className="h-9 text-[var(--dg-color-text-faint)] hover:text-[var(--dg-color-text-primary)] transition-all ease-in-out duration-150"
                  >
                    <span className="flex shrink-0 items-center justify-center">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          transform: sidebarOpen ? "rotate(180deg)" : "none",
                          transition: "transform 150ms ease",
                        }}
                      >
                        <polyline points="13 17 18 12 13 7" />
                        <polyline points="6 17 11 12 6 7" />
                      </svg>
                    </span>
                    <span className="font-semibold">Collapse Menu</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>
        )}

        <div
          data-tour="settings-content"
          style={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            overflowY: "auto",
            padding: `${isMobile ? 16 : isTablet ? 24 : 32}px var(--dg-page-gutter)`,
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
          }}
        >
          {activeItem && (
            <div style={{ width: "100%", maxWidth, marginBottom: 32 }}>
              <h1
                style={{
                  fontSize: "var(--dg-fs-page-title)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                  margin: 0,
                }}
              >
                {activeItem.label}
              </h1>
              {activeItem.description && (
                <p
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--dg-color-text-muted)",
                    margin: "5px 0 0",
                    lineHeight: 1.5,
                  }}
                >
                  {activeItem.description}
                </p>
              )}
            </div>
          )}

          {banner && <div style={{ width: "100%", maxWidth, marginBottom: 16 }}>{banner}</div>}

          {allItems.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 20px",
                color: "var(--dg-color-text-muted)",
                fontSize: "var(--dg-fs-label)",
                textAlign: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: "var(--dg-fs-heading)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-secondary)",
                }}
              >
                No access
              </span>
              <span>
                You don&apos;t have permission to view this page. Contact your organization admin
                for access.
              </span>
            </div>
          ) : (
            <div style={{ width: "100%", maxWidth }}>{children}</div>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}
