"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { cn } from "@/lib/utils";

/**
 * Where a scope's bar goes. `undefined` outside any scope, so the bar renders
 * in place; `null` while the scope's slot is mounting, so it waits.
 */
const UnsavedChangesSlotContext = createContext<HTMLElement | null | undefined>(undefined);

interface UnsavedChangesScopeProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Wraps the section an Unsaved changes bar saves. The bar floats at the
 * bottom of the screen while the section is in view, rests under it at its
 * end, and scrolls away with it. A bar rendered anywhere inside, even inside a
 * card that clips its overflow, is moved to the scope's end.
 */
export function UnsavedChangesScope({ children, className, style }: UnsavedChangesScopeProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <UnsavedChangesSlotContext.Provider value={slot}>
      <div className={cn("flex flex-col gap-4", className)} style={style}>
        {children}
        {/* `contents`, so the bar sticks within the whole scope, not this slot. */}
        <div ref={setSlot} className="contents" />
      </div>
    </UnsavedChangesSlotContext.Provider>
  );
}

interface UnsavedChangesBarProps {
  saveDisabled?: boolean;
  saving?: boolean;
  saveLabel?: string;
  /** Left out when there is nothing to put back, such as a value only suggested. */
  onDiscard?: () => void;
  onSave: () => void;
}

/** Shown once a section that edits in place has something to save. */
export function UnsavedChangesBar({
  saveDisabled = false,
  saving = false,
  saveLabel = "Save changes",
  onDiscard,
  onSave,
}: UnsavedChangesBarProps) {
  const slot = useContext(UnsavedChangesSlotContext);
  const barRef = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    let section = bar?.parentElement ?? null;
    while (section && getComputedStyle(section).display === "contents") {
      section = section.parentElement;
    }
    if (!bar || !section) return;
    const scope = section;
    // At rest the bar is the last thing in its section, so the two share a
    // bottom edge; floating, sticky lifts the bar above it.
    let frame = 0;
    const measure = () => {
      frame = 0;
      setFloating(scope.getBoundingClientRect().bottom - bar.getBoundingClientRect().bottom > 1);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    bar.addEventListener("animationend", schedule);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(scope);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      bar.removeEventListener("animationend", schedule);
      resizeObserver?.disconnect();
    };
  }, [slot]);

  if (slot === null) return null;

  const bar = (
    <div
      ref={barRef}
      role="region"
      aria-label="Unsaved changes"
      data-floating={floating ? "" : undefined}
      className="dg-unsaved-bar"
    >
      <span className="dg-unsaved-bar__label">Unsaved changes</span>
      <div className="dg-unsaved-bar__actions">
        {onDiscard ? (
          <Button
            type="button"
            className="dg-btn dg-btn-secondary dg-btn-sm"
            disabled={saving}
            onClick={onDiscard}
          >
            {EDITOR_ACTION_LABELS.discard}
          </Button>
        ) : null}
        <Button
          type="button"
          className="dg-btn dg-btn-primary dg-btn-sm"
          disabled={saveDisabled || saving}
          onClick={onSave}
        >
          <ButtonLoading
            loading={saving}
            spinnerColor="var(--dg-color-text-inverse)"
            spinnerSize={14}
          >
            {saveLabel}
          </ButtonLoading>
        </Button>
      </div>
    </div>
  );

  return slot ? createPortal(bar, slot) : bar;
}
