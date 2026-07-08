"use client";

/**
 * Organization pill shown on the org login screen and the MFA verification screen.
 * Renders `slug.baseDomain` in the brand-tinted badge.
 */
export function OrganizationBadge({
  slug,
  baseDomain,
  style,
}: {
  slug: string;
  baseDomain: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ textAlign: "center", marginBottom: "28px", ...style }}>
      <span className="dg-auth-badge">
        {slug}.{baseDomain}
      </span>
    </div>
  );
}
