import type { ReactNode } from "react";
import { DubGridLogo } from "@/components/Logo";

function StatusBarIcons() {
  return (
    <span className="landing-statusbar-icons" aria-hidden="true">
      <svg width="22" height="14" viewBox="0 0 17 11">
        <rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor" />
        <rect x="4.6" y="5" width="3" height="6" rx="1" fill="currentColor" />
        <rect x="9.2" y="2.6" width="3" height="8.4" rx="1" fill="currentColor" />
        <rect x="13.8" y="0" width="3" height="11" rx="1" fill="currentColor" />
      </svg>
      <svg width="20" height="14" viewBox="0 0 15 11">
        <path
          d="M1.3 4.2 A9 9 0 0 1 13.7 4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M3.7 6.6 A5.6 5.6 0 0 1 11.3 6.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="7.5" cy="9.4" r="1.6" fill="currentColor" />
      </svg>
      <svg width="32" height="15" viewBox="0 0 26 12">
        <rect
          x="0.5"
          y="0.5"
          width="22"
          height="11"
          rx="3.5"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".4"
        />
        <rect x="2" y="2" width="15" height="8" rx="2" fill="currentColor" />
        <rect x="23.6" y="4" width="1.8" height="4" rx=".9" fill="currentColor" fillOpacity=".4" />
      </svg>
    </span>
  );
}

/** DubGrid's app icon: the three-card mark on brand blue. */
export function LandingAppIcon() {
  return (
    <span className="landing-app-icon">
      <DubGridLogo size={15} tone="onBrand" />
    </span>
  );
}

/**
 * An iPhone 18 Pro Max drawn to scale (a 78 x 163.4 mm body around a
 * 440 x 956 point screen), with the iOS status bar and no camera island.
 */
export function LandingPhone({
  children,
  variant = "app",
  dimmed = false,
}: {
  children: ReactNode;
  variant?: "app" | "lock";
  dimmed?: boolean;
}) {
  return (
    <div className="landing-phone-frame" data-dimmed={dimmed || undefined}>
      <div className="landing-phone" data-variant={variant}>
        <div className="landing-statusbar">
          <span>{variant === "app" ? "9:41" : ""}</span>
          <StatusBarIcons />
        </div>
        {children}
      </div>
    </div>
  );
}
