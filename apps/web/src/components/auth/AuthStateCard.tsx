"use client";

import Link from "next/link";
import { Mail, CheckCircle, ShieldCheck } from "lucide-react";
import ButtonSpinner from "@/components/ButtonSpinner";

type AuthIcon = "mail" | "check" | "shield" | "spinner";

interface CtaButton {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface AuthStateCardProps {
  /** Icon shown in the tile above the heading. Omit for no tile. */
  icon?: AuthIcon;
  heading: string;
  message?: React.ReactNode;
  /** Filled pill button (primary action). */
  primaryCta?: CtaButton;
  /** Underlined text link below the primary action. */
  secondaryCta?: { label: string; href: string };
  /** Extra content rendered between the message and the CTAs. */
  children?: React.ReactNode;
}

function IconTile({ icon }: { icon: AuthIcon }) {
  const isSuccess = icon === "check";
  return (
    <div className={`dg-auth-icon-tile${isSuccess ? " dg-auth-icon-tile--success" : ""}`}>
      {icon === "mail" && <Mail size={28} />}
      {icon === "check" && <CheckCircle size={28} />}
      {icon === "shield" && <ShieldCheck size={28} />}
      {icon === "spinner" && <ButtonSpinner color="var(--color-brand)" size={28} />}
    </div>
  );
}

/**
 * Shared status card body for the auth surface: an optional icon tile,
 * heading, message, and CTAs. Render inside a <Card> (the caller keeps the
 * logo block above it).
 */
export function AuthStateCard({
  icon,
  heading,
  message,
  primaryCta,
  secondaryCta,
  children,
}: AuthStateCardProps) {
  return (
    <>
      {icon && <IconTile icon={icon} />}

      <h1 className="dg-auth-heading" style={{ marginBottom: "12px" }}>
        {heading}
      </h1>

      {message && (
        <p
          aria-live="polite"
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-muted)",
            lineHeight: 1.6,
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          {message}
        </p>
      )}

      {children}

      {primaryCta &&
        (primaryCta.href ? (
          <Link
            href={primaryCta.href}
            className="dg-auth-submit"
            style={{ textDecoration: "none" }}
          >
            {primaryCta.label}
          </Link>
        ) : (
          <button type="button" onClick={primaryCta.onClick} className="dg-auth-submit">
            {primaryCta.label}
          </button>
        ))}

      {secondaryCta && (
        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Link
            href={secondaryCta.href}
            className="dg-auth-link"
            style={{ color: "var(--color-text-subtle)" }}
          >
            {secondaryCta.label}
          </Link>
        </div>
      )}
    </>
  );
}
