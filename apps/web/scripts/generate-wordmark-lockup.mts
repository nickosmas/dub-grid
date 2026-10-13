/**
 * Renders the brand images from the shared two-card geometry in
 * @dubgrid/design-tokens, so no raster copy of the mark can drift:
 *   - public/email-lockup.png   - email header: symbol + lowercase "dubgrid" (dark)
 *   - public/email-wordmark.png - email footer: lowercase "dubgrid" only (muted)
 *   - public/lockup.png         - print view and report PDF header: symbol + wordmark
 *   - public/logo.png, logo-white.png, logo.svg - the symbol on its own
 *   - src/app/icon.png, apple-icon.png, docs/favicon.png - favicons
 *
 * Emails can't rely on web fonts (Gmail/Outlook strip @font-face), so the
 * wordmark ships as an image to guarantee the exact DM Sans typeface
 * everywhere. Run via `npm run email:lockup` after building the packages.
 * Re-run if the logo, wordmark, or colors change.
 */
import { chromium, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRAND_WORDMARK_OPTICAL_CENTER_EM,
  BRAND_MARK_BACK,
  BRAND_MARK_BACK_STROKE,
  BRAND_MARK_COLORS,
  BRAND_MARK_FRONT,
  BRAND_MARK_GAP,
  BRAND_MARK_INK,
  BRAND_MARK_SQUARE,
  brandMarkCardPath,
  getBrandLockupSymbolLayout,
} from "@dubgrid/design-tokens";

const scriptDir = dirname(fileURLToPath(import.meta.url));
// public/ backs production emails (${origin}/email-*.png); the copy in
// src/emails/static/ is served at /static by the `email dev` preview server.
const publicDir = join(scriptDir, "..", "public");
const appDir = join(scriptDir, "..", "src", "app");
const docsDir = join(scriptDir, "..", "..", "..", "docs");
const previewStaticDir = join(scriptDir, "..", "src", "emails", "static");

const SCALE = 8; // render at 8x so the images stay crisp even when zoomed

const BACK_PATH = brandMarkCardPath(BRAND_MARK_BACK);
const FRONT_PATH = brandMarkCardPath(BRAND_MARK_FRONT);

// The gap is masked out of the back card, so every image keeps a transparent
// background and sits on any surface.
function symbolSvg(viewBox: string, width: number, height: number, color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">
  <mask id="gap" maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
    <rect x="-10" y="-10" width="120" height="120" fill="#fff"/>
    <path d="${FRONT_PATH}" fill="#000" stroke="#000" stroke-width="${BRAND_MARK_GAP * 2}"/>
  </mask>
  <path d="${BACK_PATH}" fill="none" stroke="${color}" stroke-width="${BRAND_MARK_BACK_STROKE}" mask="url(#gap)"/>
  <path d="${FRONT_PATH}" fill="${color}"/>
</svg>`;
}

const INK_VIEWBOX = `${BRAND_MARK_INK.x} ${BRAND_MARK_INK.y} ${BRAND_MARK_INK.width} ${BRAND_MARK_INK.height}`;
// The symbol optically centered in a square, for the favicons and standalone logos.
const SQUARE_VIEWBOX = `${BRAND_MARK_SQUARE.x} ${BRAND_MARK_SQUARE.y} ${BRAND_MARK_SQUARE.size} ${BRAND_MARK_SQUARE.size}`;

const FONT_LINKS = `
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&display=swap" rel="stylesheet">`;

const wordStyle = (fontSize: number, color: string) =>
  `font-family:'DM Sans',sans-serif;font-weight:700;font-size:${fontSize}px;` +
  `line-height:1.25;letter-spacing:-0.02em;color:${color};`;

// Symbol spanning baseline to ascender, then the dark wordmark, spaced by
// the shared lockup rule.
function lockupHtml(fontSize: number, padding: string, lineHeight: string) {
  const layout = getBrandLockupSymbolLayout(fontSize);
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_LINKS}
<style>html,body{margin:0;padding:0;background:transparent;}
  #target{display:inline-block;padding:${padding};white-space:nowrap;${wordStyle(fontSize, "#0F172A")}line-height:${lineHeight};}
  #target svg{display:inline-block;vertical-align:${-layout.belowBaseline}px;margin-right:${layout.marginRight}px;}
</style></head>
<body><div id="target">${symbolSvg(INK_VIEWBOX, layout.width, layout.height, BRAND_MARK_COLORS.light)}dubgrid</div></body></html>`;
}

// Email header, padded for the card.
const LOCKUP_HTML = lockupHtml(30, "4px 6px", "1.25");
// Print view and report PDFs: padded only so the box's center is the
// wordmark's optical center, so callers center it like any other row item.
const PRINT_LOCKUP_FONT_SIZE = 16;
const PRINT_LOCKUP_HTML = lockupHtml(PRINT_LOCKUP_FONT_SIZE, "0", "normal");

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
  { dir: publicDir, name: "email-lockup.png", html: LOCKUP_HTML, previewCopy: true },
  { dir: publicDir, name: "email-wordmark.png", html: WORDMARK_HTML, previewCopy: true },
  { dir: publicDir, name: "wordmark-white.png", html: WORDMARK_WHITE_HTML, previewCopy: false },
  {
    dir: publicDir,
    name: "lockup.png",
    html: PRINT_LOCKUP_HTML,
    previewCopy: false,
    centerOn: PRINT_LOCKUP_FONT_SIZE,
  },
] as const;

const symbolPage = (size: number, color: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;}
  #target{display:block;width:${size}px;height:${size}px;}</style></head>
<body><div id="target">${symbolSvg(SQUARE_VIEWBOX, size, size, color)}</div></body></html>`;

// Rendered at 1x: each file is exactly its pixel size.
const SYMBOL_JOBS = [
  { dir: publicDir, name: "logo.png", size: 512, color: BRAND_MARK_COLORS.light },
  { dir: publicDir, name: "logo-white.png", size: 512, color: BRAND_MARK_COLORS.onBrand },
  { dir: appDir, name: "icon.png", size: 32, color: BRAND_MARK_COLORS.light },
  { dir: appDir, name: "apple-icon.png", size: 180, color: BRAND_MARK_COLORS.light },
  { dir: docsDir, name: "favicon.png", size: 32, color: BRAND_MARK_COLORS.light },
] as const;

// Follows the viewer's color scheme where the SVG is shown on its own.
const LOGO_SVG = symbolSvg(SQUARE_VIEWBOX, 128, 128, "currentColor").replace(
  "<mask",
  `<style>svg{color:${BRAND_MARK_COLORS.light}}@media (prefers-color-scheme:dark){svg{color:${BRAND_MARK_COLORS.dark}}}</style>
  <mask`,
);

async function renderToPng(page: Page, html: string, outPath: string, centerOn?: number) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready);
  if (centerOn) {
    // Pad the short side so the box's middle is the wordmark's optical center.
    await page.evaluate(
      ({ center }) => {
        const target = document.getElementById("target")!;
        const marker = document.createElement("span");
        marker.style.display = "inline-block";
        target.append(marker);
        const box = target.getBoundingClientRect();
        const baseline = marker.getBoundingClientRect().bottom - box.top;
        marker.remove();
        const offset = 2 * (baseline - center) - box.height;
        target.style[offset > 0 ? "paddingBottom" : "paddingTop"] = `${Math.abs(offset)}px`;
      },
      { center: BRAND_WORDMARK_OPTICAL_CENTER_EM.y * centerOn },
    );
  }
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
  const only = process.argv.slice(2);
  const wanted = (name: string) => only.length === 0 || only.includes(name);
  for (const job of JOBS) {
    const { dir, name, html, previewCopy } = job;
    if (!wanted(name)) continue;
    const box = await renderToPng(
      page,
      html,
      join(dir, name),
      "centerOn" in job ? job.centerOn : undefined,
    );
    if (previewCopy) {
      copyFileSync(join(dir, name), join(previewStaticDir, name));
    }
    console.log(
      `✓ ${name} at ${SCALE}x — display ${Math.round(box.width)}x${Math.round(box.height)} (CSS px)`,
    );
  }
  const iconPage = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { dir, name, size, color } of SYMBOL_JOBS) {
    if (!wanted(name)) continue;
    await renderToPng(iconPage, symbolPage(size, color), join(dir, name));
    console.log(`✓ ${name} — ${size}x${size}`);
  }
  if (wanted("logo.svg")) {
    writeFileSync(join(publicDir, "logo.svg"), `${LOGO_SVG}\n`);
    console.log("✓ logo.svg");
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
