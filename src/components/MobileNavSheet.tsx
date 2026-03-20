"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useMobileSubNav, SubNavItem } from "@/components/MobileSubNavContext";

interface MainNavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface MobileNavSheetProps {
  open: boolean;
  onClose: () => void;
  mainNavItems: MainNavItem[];
  activeTab: string;
  isGridmaster: boolean;
  displayName: string;
  initials: string;
  roleLabel: string;
  onSignOut: () => void;
}

export default function MobileNavSheet({
  open,
  onClose,
  mainNavItems,
  activeTab,
  isGridmaster,
  displayName,
  initials,
  roleLabel,
  onSignOut,
}: MobileNavSheetProps) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const { items: subNavItems } = useMobileSubNav();

  // Drill-down state: null = root level, object = drilled into a section
  const [drillSection, setDrillSection] = useState<{ id: string; label: string } | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  // Reset drill state when sheet closes
  useEffect(() => {
    if (!open) setDrillSection(null);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Focus first element on open
  useEffect(() => {
    if (!open || !sheetRef.current) return;
    const first = sheetRef.current.querySelector<HTMLElement>("a, button");
    first?.focus();
  }, [open]);

  if (!open) return null;

  function navigate(href: string) {
    close();
    router.push(href);
  }

  function handleMainItemClick(item: MainNavItem) {
    const isActive = activeTab === item.id;

    // Always drill into the section
    setDrillSection({ id: item.id, label: item.label });

    // If not the active page, navigate without closing the sheet
    // The new page will mount and register its sub-nav items
    if (!isActive) {
      router.push(item.href);
    }
  }

  function handleSubItemClick(item: SubNavItem) {
    if (item.onClick) {
      item.onClick();
      close();
    } else if (item.href) {
      navigate(item.href);
    }
  }

  return createPortal(
    <>
      <div
        className="dg-bottom-sheet-overlay"
        onClick={close}
        aria-hidden="true"
      />
      <div
        className="dg-bottom-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="dg-bottom-sheet-handle" />

        {drillSection === null ? (
          /* ── Root Level: Main navigation + Profile ── */
          <>
            <div className="dg-bottom-sheet-top">
              {mainNavItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleMainItemClick(item)}
                    className={`dg-bottom-sheet-main-item${isActive ? " active" : ""}`}
                  >
                    <span className="dg-bottom-sheet-item-icon">{item.icon}</span>
                    <span className="dg-bottom-sheet-item-label">{item.label}</span>
                    <span className="dg-bottom-sheet-chevron">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                  </button>
                );
              })}
              {isGridmaster && (
                <button
                  onClick={() => navigate("/gridmaster")}
                  className="dg-bottom-sheet-main-item dg-bottom-sheet-main-item--gridmaster"
                >
                  <span className="dg-bottom-sheet-item-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </span>
                  <span className="dg-bottom-sheet-item-label">Gridmaster</span>
                  <span className="dg-bottom-sheet-chevron">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </button>
              )}
            </div>

            {/* Footer: Profile + Sign out */}
            <div className="dg-bottom-sheet-footer">
              <div className="dg-bottom-sheet-user">
                <div className="dg-bottom-sheet-avatar">
                  {initials}
                </div>
                <div>
                  <div className="dg-bottom-sheet-user-name">{displayName}</div>
                  <div className="dg-bottom-sheet-user-role">{roleLabel}</div>
                </div>
              </div>
              <div className="dg-bottom-sheet-footer-actions">
                <button
                  onClick={() => navigate("/profile")}
                  className="dg-bottom-sheet-footer-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Profile
                </button>
                <button
                  onClick={() => { close(); onSignOut(); }}
                  className="dg-bottom-sheet-footer-btn dg-bottom-sheet-footer-btn--danger"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ── Drill-Down Level: Back + Sub-navigation ── */
          <>
            <div className="dg-bottom-sheet-drill-header">
              <button
                className="dg-bottom-sheet-drill-back"
                onClick={() => setDrillSection(null)}
                aria-label="Back to main navigation"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="dg-bottom-sheet-drill-title">{drillSection.label}</span>
            </div>

            <nav className="dg-bottom-sheet-drill-list">
              {subNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSubItemClick(item)}
                  className={`dg-bottom-sheet-drill-item${item.active ? " active" : ""}`}
                >
                  <span className="dg-bottom-sheet-item-label">{item.label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
