"use client";

import { useState, useRef, useEffect } from "react";

interface AddPersonDropdownProps {
  onAddToSchedule: () => void;
  onInviteToApp: () => void;
  canManageEmployees: boolean;
  isMobile: boolean;
}

export function AddPersonDropdown({
  onAddToSchedule,
  onInviteToApp,
  canManageEmployees,
  isMobile,
}: AddPersonDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!canManageEmployees) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center shrink-0 rounded-[10px] bg-[var(--color-brand)] text-white hover:opacity-90 transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 ${
          isMobile ? "h-11 w-11" : "h-[var(--dg-toolbar-h)] gap-1.5 px-3"
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {!isMobile && <span className="text-[13px] font-semibold">Add</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-[10px] border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow-float)]"
        >
          <button
            onClick={() => { onAddToSchedule(); setOpen(false); }}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] rounded-[8px] mx-1"
            style={{ width: "calc(100% - 8px)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)] shrink-0">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <div>
              <div className="font-semibold text-[var(--color-text-primary)]">Add to Schedule</div>
              <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Create a staff member for shifts</div>
            </div>
          </button>
          <button
            onClick={() => { onInviteToApp(); setOpen(false); }}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] rounded-[8px] mx-1"
            style={{ width: "calc(100% - 8px)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)] shrink-0">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <div>
              <div className="font-semibold text-[var(--color-text-primary)]">Invite to App</div>
              <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">HR, finance, management, etc.</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
