"use client";

import type { ReactNode } from "react";

/** One labelled fact. A missing value reads as `empty` rather than a dash. */
export function PersonField({
  label,
  value,
  empty = "Not recorded",
  tabular = false,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  empty?: string;
  tabular?: boolean;
  wide?: boolean;
}) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="dg-type-field-title">{label}</dt>
      <dd
        className={`mt-1 break-words text-[13px] ${
          missing ? "text-[var(--dg-color-text-muted)]" : "text-[var(--dg-color-text-primary)]"
        } ${tabular && !missing ? "dg-tabular-nums" : ""}`}
      >
        {missing ? empty : value}
      </dd>
    </div>
  );
}

export function PersonFieldGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>;
}

export function PersonActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-[var(--dg-color-border-light)] px-[var(--dg-card-padding-x)] py-3.5">
      {children}
    </div>
  );
}

export function PersonSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="dg-card">
      <div className="dg-card-header">
        <div>
          <h3 className="dg-card-title">{title}</h3>
          {description ? <div className="dg-card-subtitle">{description}</div> : null}
        </div>
      </div>
      <div className="dg-card-body flex flex-col gap-5">{children}</div>
      {actions ? <PersonActions>{actions}</PersonActions> : null}
    </section>
  );
}

export function PersonSubheading({ children }: { children: ReactNode }) {
  return <h4 className="dg-type-content-group-heading">{children}</h4>;
}
