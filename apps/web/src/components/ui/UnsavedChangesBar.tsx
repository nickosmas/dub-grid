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
import { footerSection, useFloatingFooter } from "@/components/ui/use-floating-footer";
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
 * Wraps the section an Unsaved changes bar saves, so the bar sticks within the
 * whole section and scrolls away with it. A bar rendered anywhere inside, even
 * inside a card that clips its overflow, is moved to the scope's end.
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
  /** Something differs from what is saved. Until then Save is off and the bar stays put. */
  dirty: boolean;
  saveDisabled?: boolean;
  saving?: boolean;
  saveLabel?: string;
  /** Left out when there is nothing to put back, such as a value only suggested. */
  onDiscard?: () => void;
  onSave: () => void;
}

/**
 * The footer of a section that edits in place, always shown. While one of its
 * buttons can be pressed it floats at the bottom of the screen as the section
 * scrolls; otherwise, and at the section's end, it is the last card's footer.
 */
export function UnsavedChangesBar({
  dirty,
  saveDisabled = false,
  saving = false,
  saveLabel = "Save",
  onDiscard,
  onSave,
}: UnsavedChangesBarProps) {
  const slot = useContext(UnsavedChangesSlotContext);
  const barRef = useRef<HTMLDivElement>(null);
  const showDiscard = dirty && Boolean(onDiscard);
  const canSave = dirty && !saveDisabled;
  // It floats only while something can be pressed, or while a save is underway.
  const sticky = saving || canSave || showDiscard;
  const floating = useFloatingFooter(barRef, sticky && slot !== null);
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    const section = bar ? footerSection(bar) : null;
    if (!bar || !section || slot === null) return;
    // The card the bar closes off: the last one in the section.
    const host =
      Array.from(section.querySelectorAll<HTMLElement>(HOST_SELECTOR))
        .filter((card) => !bar.contains(card) && !card.parentElement?.closest(HOST_SELECTOR))
        .at(-1) ?? null;
    if (!host) {
      setDocked(false);
      return;
    }
    const style = getComputedStyle(host);
    bar.style.setProperty("--dg-unsaved-bar-host-radius", style.borderBottomLeftRadius);
    bar.style.setProperty("--dg-unsaved-bar-host-shadow", style.boxShadow);
    const paddingX = style.getPropertyValue("--dg-card-padding-x").trim();
    bar.style.setProperty("--dg-unsaved-bar-host-px", paddingX || "20px");
    host.toggleAttribute(DOCKED_HOST_ATTRIBUTE, !floating);
    setDocked(!floating);
    return () => host.removeAttribute(DOCKED_HOST_ATTRIBUTE);
  }, [slot, floating]);

  if (slot === null) return null;

  const bar = (
    <div
      ref={barRef}
      role={dirty ? "region" : undefined}
      aria-label={dirty ? "Unsaved changes" : undefined}
      data-sticky={sticky ? "" : undefined}
      data-placement={floating ? "floating" : docked ? "docked" : "resting"}
      className="dg-unsaved-bar"
    >
      <div className="dg-unsaved-bar__actions">
        {showDiscard ? (
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
          disabled={!canSave || saving}
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
