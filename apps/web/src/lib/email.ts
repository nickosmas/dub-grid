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

/**
 * Render the branded email header using a text wordmark to keep email colors in sync.
 */
function emailHeader(): string {
  return `<div style="padding:32px 32px 0;text-align:center;">
      <span style="display:inline-block;font-size:24px;line-height:1;font-weight:800;letter-spacing:-0.02em;color:#2563EB;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">DubGrid</span>
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
