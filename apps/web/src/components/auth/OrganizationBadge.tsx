"use client";

/**
 * Organization pill shown on the org login screen and the MFA verification screen.
 * Renders `slug.baseDomain` in the brand-tinted badge.
 */
export function OrganizationBadge({
  slug,
  baseDomain,
  className = "",
}: {
  slug: string;
  baseDomain: string;
  className?: string;
}) {
  return (
    <div className={`dg-auth-badge-wrap${className ? ` ${className}` : ""}`}>
      <span className="dg-auth-badge">
        {slug}.{baseDomain}
      </span>
    </div>
  );
}
