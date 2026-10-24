"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft } from "lucide-react";
import React from "react";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";

interface ModalProps {
  title: string;
  /** A muted line under the title, such as who the dialog is about. */
  subtitle?: string;
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
  "aria-describedby"?: string;
}

export default function Modal({
  title,
  subtitle,
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
          onClick={disableOverlayClose ? undefined : handleClose}
          role="presentation"
        >
          <Dialog.Popup
            aria-modal={headerSafe ? undefined : true}
            initialFocus
            finalFocus={returnFocus ?? true}
            aria-label={subtitle ? `${title}, ${subtitle}` : title}
            aria-describedby={ariaDescribedby}
            className={`dg-modal${footer ? " dg-modal--with-footer" : ""}${className ? ` ${className}` : ""}`}
            style={style}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dg-modal-header">
              <div className="dg-modal-heading">
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
                <div className="dg-modal-titles">
                  <span className="dg-modal-title">{title}</span>
                  {subtitle ? <span className="dg-modal-subtitle">{subtitle}</span> : null}
                </div>
              </div>
              {showCloseButton ? (
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
