/**
 * The app's @font-face rules. The print window is a blank document, so
 * without them it sets the schedule in a wider fallback face and labels
 * outgrow the pills that were sized for Inter.
 */
export function collectFontFaceCss(source: Document): string {
  const rules: string[] = [];
  for (const sheet of Array.from(source.styleSheets)) {
    let sheetRules: CSSRuleList;
    try {
      sheetRules = sheet.cssRules;
    } catch {
      continue; // A cross-origin sheet does not expose its rules.
    }
    for (const rule of Array.from(sheetRules)) {
      if (rule.cssText.startsWith("@font-face")) rules.push(rule.cssText);
    }
  }
  return rules.join("\n");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildPrintDocument(input: {
  title: string;
  fontFaceCss: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.title)}</title>
  <style>
    ${input.fontFaceCss}
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page { size: landscape; margin: 0.5in; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: 'Inter', system-ui, -apple-system, sans-serif; font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
    .print-schedule-content { width: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
    thead { display: table-header-group; }
    tr, [data-print-legend] { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head><body>${input.bodyHtml}</body></html>`;
}

/** Resolves once the print window's images and fonts are ready to print. */
export async function whenPrintReady(target: Window): Promise<void> {
  await Promise.all(
    Array.from(target.document.images).map((image) =>
      image.complete
        ? undefined
        : new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
  // Faces load only once layout asks for them, so lay out before waiting.
  void target.document.body?.offsetHeight;
  await target.document.fonts?.ready;
}
