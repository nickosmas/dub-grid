"use client";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/Button";
import { openConsentPreferences } from "@/components/CookieConsent";

const POLICY_LINKS = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
  { href: "/cookie-policy", label: "Cookie policy" },
];

export function DataPrivacyPanel() {
  return (
    <div className="divide-y divide-[var(--dg-color-border-light)]">
      <div className="dg-card-body flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <div className="text-[14px] font-medium text-[var(--dg-color-text-primary)]">
            Cookie preferences
          </div>
          <p className="dg-card-description">
            Choose which cookies and analytics the app uses on this device.
          </p>
        </div>
        <Button
          type="button"
          onClick={openConsentPreferences}
          className="dg-btn dg-btn-secondary dg-btn-sm"
        >
          Manage cookies
        </Button>
      </div>
      <div className="dg-card-body">
        <div className="mb-1 text-[14px] font-medium text-[var(--dg-color-text-primary)]">
          Policies
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
          {POLICY_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] text-[var(--dg-color-link)] no-underline hover:underline"
              >
                {link.label}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
