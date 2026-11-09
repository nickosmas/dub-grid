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

/** Cards a docked bar can close off; SectionCard and other styled cards opt in. */
const HOST_SELECTOR = ".dg-card, [data-unsaved-bar-host]";
const DOCKED_HOST_ATTRIBUTE = "data-unsaved-bar-docked";

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
  const [placement, setPlacement] = useState<"floating" | "docked" | "resting">("resting");
  // Only shown while a button can be pressed, or while a save is underway.
  const actionable = saving || !saveDisabled || Boolean(onDiscard);
  const shown = slot !== null && actionable;

  useEffect(() => {
    const bar = barRef.current;
    let section = bar?.parentElement ?? null;
    while (section && getComputedStyle(section).display === "contents") {
      section = section.parentElement;
    }
    if (!shown || !bar || !section) return;
    const scope = section;
    let host: HTMLElement | null = null;
    // The card the bar closes off when it docks: the last one in the section.
    const findHost = () => {
      const cards = Array.from(scope.querySelectorAll<HTMLElement>(HOST_SELECTOR)).filter(
        (card) => !bar.contains(card) && !card.parentElement?.closest(HOST_SELECTOR),
      );
      const next = cards.at(-1) ?? null;
      if (next !== host) {
        host?.removeAttribute(DOCKED_HOST_ATTRIBUTE);
        host = next;
        if (host) {
          const style = getComputedStyle(host);
          bar.style.setProperty("--dg-unsaved-bar-host-radius", style.borderBottomLeftRadius);
          bar.style.setProperty("--dg-unsaved-bar-host-shadow", style.boxShadow);
          const paddingX = style.getPropertyValue("--dg-card-padding-x").trim();
          bar.style.setProperty("--dg-unsaved-bar-host-px", paddingX || "20px");
        }
      }
    };
    // At rest the bar is the last thing in its section, so the two share a
    // bottom edge; floating, sticky lifts the bar above it.
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!host?.isConnected) findHost();
      const floating =
        scope.getBoundingClientRect().bottom - bar.getBoundingClientRect().bottom > 1;
      host?.toggleAttribute(DOCKED_HOST_ATTRIBUTE, !floating);
      setPlacement(floating ? "floating" : host ? "docked" : "resting");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    findHost();
    measure();
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    bar.addEventListener("animationend", schedule);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            findHost();
            schedule();
          });
    resizeObserver?.observe(scope);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      bar.removeEventListener("animationend", schedule);
      resizeObserver?.disconnect();
      host?.removeAttribute(DOCKED_HOST_ATTRIBUTE);
    };
  }, [slot, shown]);

  if (!shown) return null;

  const bar = (
    <div
      ref={barRef}
      role="region"
      aria-label="Unsaved changes"
      data-placement={placement}
      className="dg-unsaved-bar"
    >
      <div className="dg-unsaved-bar__actions">
        {onDiscard ? (
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            disabled={saving}
            onClick={onDiscard}
          >
            {EDITOR_ACTION_LABELS.discard}
          </Button>
        ) : null}
        <Button
          type="button"
          className="dg-btn dg-btn-primary"
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
