"use client";

import Link from "next/link";
import { Mail, CheckCircle, ShieldCheck } from "lucide-react";
import ButtonSpinner from "@/components/ButtonSpinner";
import { Button } from "@/components/Button";

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
      {icon === "spinner" && <ButtonSpinner color="var(--dg-color-brand)" size={28} />}
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

      <h1 className="dg-auth-heading dg-auth-state-heading">{heading}</h1>

      {message && (
        <p aria-live="polite" className="dg-auth-state-message">
          {message}
        </p>
      )}

      {children}

      {primaryCta &&
        (primaryCta.href ? (
          <Link
            href={primaryCta.href}
            className="dg-btn dg-btn-primary dg-btn-lg dg-auth-state-primary"
          >
            {primaryCta.label}
          </Link>
        ) : (
          <Button
            type="button"
            onClick={primaryCta.onClick}
            className="dg-btn dg-btn-primary dg-btn-lg dg-auth-state-primary"
          >
            {primaryCta.label}
          </Button>
        ))}

      {secondaryCta && (
        <div className="dg-auth-state-secondary">
          <Link href={secondaryCta.href} className="dg-auth-link dg-auth-link--subtle">
            {secondaryCta.label}
          </Link>
        </div>
      )}
    </>
  );
}
