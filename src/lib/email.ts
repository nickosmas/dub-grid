/** Shared email template utilities — branded HTML emails with DubGrid logo. */

/** Strip control characters (including CRLF, null bytes) to prevent email header injection. */
export function sanitizeHeaderValue(str: string): string {
  return str.replace(/[\x00-\x1f\x7f]/g, "");
}

/** Escape HTML special characters to prevent XSS in email content. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build the logo as a static image tag pointing to the hosted logo.png. */
function logoHtml(): string {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "http://localhost:3000");
  return `<img src="${siteUrl}/logo.png" alt="DubGrid" width="44" height="44" style="display:block;margin:0 auto 12px auto;border:0;" />`;
}

/**
 * Render the branded email header: green banner with grid logo + "dubgrid" wordmark.
 */
function emailHeader(): string {
  return `<div style="background:#005F02;border-radius:16px 16px 0 0;padding:32px 32px 24px;text-align:center;">
      ${logoHtml()}
      <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0;font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">dubgrid</div>
    </div>`;
}

/**
 * Wrap email body content in the full branded template shell.
 * Provides consistent header, body card, and outer styling.
 */
export function emailWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#F7F8F5;font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 20px;">
    ${emailHeader()}
    <div style="background:#fff;padding:40px 32px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}
