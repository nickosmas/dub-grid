import type { ReactNode } from "react";
import { StatusIcon } from "./StatusIcon";

/**
 * A callout inside a legal document. The icon and title carry the colour and
 * the body stays document text, so it can't be taken for an app banner.
 */
export function LegalNotice({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div
      role="note"
      className="mt-4 rounded-r-[10px] border-l-[3px] border-[var(--dg-color-legal-notice-rule)] bg-[var(--dg-color-legal-notice-bg)] px-4 py-3.5"
    >
      <p className="mb-1.5 flex items-start gap-2 text-[length:var(--dg-fs-body)] font-semibold leading-5 text-[var(--dg-color-banner-warning-text)]">
        <StatusIcon tone="warning" size={20} className="shrink-0" />
        <span>{title}</span>
      </p>
      <div className="text-[length:var(--dg-fs-body)] leading-[1.7] text-[var(--dg-color-text-secondary)]">
        {children}
      </div>
    </div>
  );
}
