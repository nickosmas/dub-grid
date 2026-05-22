/**
 * Renders the email brand images to transparent high-res PNGs in
 * apps/web/public/:
 *   - email-lockup.png   — header: grid logo + lowercase "dubgrid" (dark)
 *   - email-wordmark.png — footer: lowercase "dubgrid" only (muted)
 *
 * Emails can't rely on web fonts (Gmail/Outlook strip @font-face), so the
 * wordmark ships as an image to guarantee the exact DM Sans typeface
 * everywhere. Run via `npm run email:lockup`. Re-run if the logo, wordmark,
 * or colors change.
 */
import { chromium, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
// public/ backs production emails (${origin}/email-*.png); the copy in
// src/emails/static/ is served at /static by the `email dev` preview server.
const publicDir = join(scriptDir, "..", "public");
const previewStaticDir = join(scriptDir, "..", "src", "emails", "static");

const SCALE = 8; // render at 8x so the images stay crisp even when zoomed

// Grid mark from public/logo.svg, fill forced to brand blue (no dark-mode
// media query — the PNG sits on the email's white card).
const LOGO_SVG = `
<svg width="34" height="34" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <g fill="#2563EB">
    <rect x="3.2" y="3.2" width="25.6" height="25.6" rx="6.4"/>
    <rect x="35.2" y="3.2" width="25.6" height="25.6" rx="6.4"/>
    <rect x="67.2" y="3.2" width="25.6" height="25.6" rx="6.4"/>
    <rect x="99.2" y="3.2" width="25.6" height="25.6" rx="6.4"/>
    <rect x="3.2" y="35.2" width="25.6" height="25.6" rx="6.4"/>
    <rect x="35.2" y="35.2" width="25.6" height="25.6" rx="6.4" opacity="0.75"/>
    <rect x="67.2" y="35.2" width="25.6" height="25.6" rx="6.4" opacity="0.75"/>
    <rect x="99.2" y="35.2" width="25.6" height="25.6" rx="6.4" opacity="0.3"/>
    <rect x="3.2" y="67.2" width="25.6" height="25.6" rx="6.4"/>
    <rect x="35.2" y="67.2" width="25.6" height="25.6" rx="6.4" opacity="0.75"/>
    <rect x="67.2" y="67.2" width="25.6" height="25.6" rx="6.4" opacity="0.3"/>
    <rect x="99.2" y="67.2" width="25.6" height="25.6" rx="6.4" opacity="0.3"/>
    <rect x="3.2" y="99.2" width="25.6" height="25.6" rx="6.4"/>
    <rect x="35.2" y="99.2" width="25.6" height="25.6" rx="6.4" opacity="0.3"/>
    <rect x="67.2" y="99.2" width="25.6" height="25.6" rx="6.4" opacity="0.3"/>
    <rect x="99.2" y="99.2" width="25.6" height="25.6" rx="6.4" opacity="0.3"/>
  </g>
</svg>`;

const FONT_LINKS = `
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&display=swap" rel="stylesheet">`;

const wordStyle = (fontSize: number, color: string) =>
  `font-family:'DM Sans',sans-serif;font-weight:700;font-size:${fontSize}px;` +
  `line-height:1.25;letter-spacing:-0.02em;color:${color};`;

// Header lockup: grid + dark wordmark.
const LOCKUP_HTML = `<!doctype html><html><head><meta charset="utf-8">${FONT_LINKS}
<style>html,body{margin:0;padding:0;background:transparent;}
  #target{display:inline-flex;align-items:center;gap:10px;padding:4px 6px;}
  #target .mark{display:block;}
  #target .word{${wordStyle(30, "#0F172A")}}
</style></head>
<body><div id="target"><span class="mark">${LOGO_SVG}</span><span class="word">dubgrid</span></div></body></html>`;

// Footer wordmark: muted text only.
const WORDMARK_HTML = `<!doctype html><html><head><meta charset="utf-8">${FONT_LINKS}
<style>html,body{margin:0;padding:0;background:transparent;}
  #target{display:inline-block;padding:2px 4px;${wordStyle(16, "#64748B")}}
</style></head>
<body><div id="target">dubgrid</div></body></html>`;

// White wordmark for the print view + PDF reports, which only use its shape:
// PrintScheduleView applies filter:brightness(0) and the report PDF recolors
// via the alpha channel. White keeps it usable on dark backgrounds too.
const WORDMARK_WHITE_HTML = `<!doctype html><html><head><meta charset="utf-8">${FONT_LINKS}
<style>html,body{margin:0;padding:0;background:transparent;}
  #target{display:inline-block;padding:2px 4px;${wordStyle(16, "#FFFFFF")}}
</style></head>
<body><div id="target">dubgrid</div></body></html>`;

// previewCopy: also copy into src/emails/static for the `email dev` preview.
const JOBS = [
  { name: "email-lockup.png", html: LOCKUP_HTML, previewCopy: true },
  { name: "email-wordmark.png", html: WORDMARK_HTML, previewCopy: true },
  { name: "wordmark-white.png", html: WORDMARK_WHITE_HTML, previewCopy: false },
] as const;

async function renderToPng(page: Page, html: string, outPath: string) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() =>
    (document as Document & { fonts: FontFaceSet }).fonts.ready,
  );
  const el = page.locator("#target");
  const box = await el.boundingBox();
  if (!box) throw new Error(`target not found for ${outPath}`);
  await el.screenshot({ path: outPath, omitBackground: true });
  return box; // CSS px = the @1x display size
}

async function main() {
  mkdirSync(previewStaticDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: SCALE });
  for (const { name, html, previewCopy } of JOBS) {
    const box = await renderToPng(page, html, join(publicDir, name));
    if (previewCopy) {
      copyFileSync(join(publicDir, name), join(previewStaticDir, name));
    }
    console.log(
      `✓ ${name} at ${SCALE}x — display ${Math.round(box.width)}x${Math.round(box.height)} (CSS px)`,
    );
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
