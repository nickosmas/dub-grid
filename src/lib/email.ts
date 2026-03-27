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

/** Resolve the site URL for absolute links in emails. */
function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "http://localhost:3000")
  );
}

/**
 * Render the branded email header: logo icon + PNG wordmark side by side.
 */
function emailHeader(): string {
  const url = siteUrl();
  return `<div style="padding:32px 32px 0;text-align:center;">
      <img src="${url}/logo.png" alt="DubGrid" width="40" height="40" style="display:inline-block;vertical-align:middle;margin-right:8px;border:0;" /><img src="${url}/wordmark-dark.png" alt="dubgrid" height="22" style="display:inline-block;vertical-align:middle;border:0;" />
    </div>`;
}

/**
 * Wrap email body content in the full branded template shell.
 * Clean white card — consistent with Supabase auth email templates.
 */
export function emailWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;padding:0 16px;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      ${emailHeader()}
      <div style="padding:32px;">
        ${bodyHtml}
      </div>
    </div>
    <div style="padding:20px 0;text-align:center;">
      <span style="font-size:12px;color:#9ca3af;">DubGrid</span>
    </div>
  </div>
</body>
</html>`;
}
