"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import React from "react";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";

export type ModalAlertTone = "brand" | "warning" | "danger";

/**
 * Makes the popup an alert dialog: it asks for a decision, so it leads with
 * an icon tinted by how serious the decision is, and has no X. Its buttons
 * and Escape are the only ways out, and clicking outside does nothing.
 */
export interface ModalAlert {
  icon: LucideIcon;
  tone?: ModalAlertTone;
}

interface ModalProps {
  title: string;
  alert?: ModalAlert;
  /** A muted line under the title, such as who the dialog is about. */
  subtitle?: string;
  /** Richer header content shown in place of the title text; `title` still names the dialog. */
  heading?: React.ReactNode;
  /** Shows a back button before the title, for a dialog with steps. */
  onBack?: () => void;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onRequestClose?: () => boolean;
  showCloseButton?: boolean;
  /** When true, clicking the backdrop does not close the modal. */
  disableOverlayClose?: boolean;
  /**
   * When true, the overlay starts below the sticky app header so the top
   * nav remains visible and clickable. Use for non-blocking detail views.
   */
  headerSafe?: boolean;
  /** Action row pinned below the scroll region, spaced evenly above and below. */
  footer?: React.ReactNode;
  returnFocus?: React.RefObject<HTMLElement | null>;
  /** Where focus starts when the modal opens; the first focusable element when absent. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  "aria-describedby"?: string;
}

export default function Modal({
  title,
  alert,
  subtitle,
  heading,
  onBack,
  onClose,
  children,
  className,
  style,
  onRequestClose,
  showCloseButton = true,
  disableOverlayClose = false,
  headerSafe = false,
  footer,
  returnFocus,
  initialFocus,
  "aria-describedby": ariaDescribedby,
}: ModalProps) {
  const closingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [closing, setClosing] = useState(false);

  // Clear timeout on unmount to prevent stale onClose calls
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const AlertIcon = alert?.icon;
  const closeOnOverlay = !disableOverlayClose && !alert;
  const closeButton = showCloseButton && !alert;

  // Animated close — ref guard prevents double-fire race condition
  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    if (onRequestClose && !onRequestClose()) return;
    closingRef.current = true;
    setClosing(true);
    timeoutRef.current = setTimeout(() => onClose(), 150);
  }, [onClose, onRequestClose]);

  return (
    <Dialog.Root
      open
      modal={!headerSafe}
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <Dialog.Portal>
        <div
          className={`dg-modal-overlay${closing ? " closing" : ""}${headerSafe ? " is-header-safe" : ""}`}
          onClick={closeOnOverlay ? handleClose : undefined}
          role="presentation"
        >
          <Dialog.Popup
            // Undefined would replace the popup's own "dialog" role.
            {...(alert ? { role: "alertdialog" } : {})}
            aria-modal={headerSafe ? undefined : true}
            initialFocus={
              initialFocus
                ? () => {
                    // Without preventScroll, a button at the end of a long
                    // dialog's scroll region scrolls it to the bottom on open.
                    const element = initialFocus.current;
                    if (!element) return true;
                    element.focus({ preventScroll: true });
                    return false;
                  }
                : true
            }
            finalFocus={returnFocus ?? true}
            aria-label={subtitle ? `${title}, ${subtitle}` : title}
            aria-describedby={ariaDescribedby}
            className={`dg-modal${alert ? " dg-modal--alert" : ""}${footer ? " dg-modal--with-footer" : ""}${className ? ` ${className}` : ""}`}
            style={style}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dg-modal-header">
              <div className={`dg-modal-heading${subtitle ? " has-subtitle" : ""}`}>
                {onBack ? (
                  <button
                    type="button"
                    className="dg-close-btn dg-close-btn--lg"
                    onClick={onBack}
                    aria-label="Back"
                  >
                    <ChevronLeft size={20} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                ) : null}
                {AlertIcon ? (
                  <span className="dg-modal-icon" data-tone={alert?.tone ?? "brand"}>
                    <AlertIcon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                ) : null}
                {heading ?? (
                  <div className="dg-modal-titles">
                    <span className="dg-modal-title">{title}</span>
                    {subtitle ? <span className="dg-modal-subtitle">{subtitle}</span> : null}
                  </div>
                )}
              </div>
              {closeButton ? (
                <CloseButton size="lg" onClick={handleClose} aria-label="Close modal" />
              ) : null}
            </div>
            <div className="dg-modal-scroll-region">{children}</div>
            {footer ? <div className="dg-modal-footer">{footer}</div> : null}
            <ScrollOverflowCue />
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
