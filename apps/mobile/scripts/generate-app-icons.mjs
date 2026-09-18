/**
 * Renders the mobile launcher and launch images into apps/mobile/assets/images/.
 *
 * App icons are the DM Sans wordmark stacked as "dub" over "grid" on brand
 * blue, because the 16-cell grid mark cannot survive the launcher masks: iOS
 * clips its corner cells and Android shows only the central 72/108 of an
 * adaptive icon.
 *   - icon.png                      iOS, opaque blue field behind Apple's squircle
 *   - adaptive-icon.png             Android foreground layer, white on transparent
 *   - adaptive-icon-monochrome.png  Android themed-icon layer, same shapes
 *
 * Launch images are the first frame of the JS splash: the static grid mark
 * with AnimatedDubGridLogo's geometry, so the native splash hands off to the
 * animated one without a visible seam.
 *   - splash-icon.png / splash-icon-dark.png
 *
 * Run `npm run icons` in apps/mobile, then `npx expo prebuild` and rebuild
 * the dev client so the native asset catalogs pick the files up.
 * `--preview <path>` also writes a sheet of the icons under each platform's
 * mask.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(scriptDir, "..", "assets", "images");
const fontPath = require.resolve("@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf");

const SIZE = 1024;
const BRAND_BLUE = "#2563EB";
const WHITE = "#FFFFFF";

// Android shows the central 72/108 of an adaptive icon and guarantees only the
// inner 66/108 circle under every launcher mask. iOS shows the whole square.
const ANDROID_VISIBLE = 72 / 108;
const ANDROID_SAFE = 66 / 108;

// Wordmark width as a share of what the launcher shows, so the mark reads at
// the same scale inside the iOS squircle and the Android circle.
const WORDMARK_WIDTH = 0.6;
// Baseline-to-baseline pitch in em: tight enough that the two words read as one
// mark while "grid"'s ascenders still clear the "dub" baseline.
const LINE_PITCH = 0.94;
const LETTER_SPACING = "-0.02em"; // matches DubGridWordmark

// Mirrors @dubgrid/design-tokens (BRAND_ANIMATED_LOGO_SIZE and the light and
// dark `brand` colors), which plain Node cannot import from the package's
// bundler-only dist. Keep in step with `imageWidth` in app.json.
const SPLASH_MARK_SIZE = 96;
// Drawn at 10x so every cell edge lands on a whole pixel.
const SPLASH_SCALE = 10;
const SPLASHES = [
  { name: "splash-icon.png", color: "#2563EB" },
  { name: "splash-icon-dark.png", color: "#2075FF" },
];

const ICONS = [
  { name: "icon.png", background: BRAND_BLUE, visible: 1, safe: 1 },
  { name: "adaptive-icon.png", background: null, visible: ANDROID_VISIBLE, safe: ANDROID_SAFE },
  {
    name: "adaptive-icon-monochrome.png",
    background: null,
    visible: ANDROID_VISIBLE,
    safe: ANDROID_SAFE,
  },
];

function drawIcon({
  size,
  background,
  color,
  visible,
  safe,
  widthShare,
  linePitch,
  letterSpacing,
}) {
  const lines = ["dub", "grid"];
  const scratch = document.createElement("canvas");
  scratch.width = size;
  scratch.height = size;
  const sctx = scratch.getContext("2d");
  if (!("letterSpacing" in sctx)) throw new Error("canvas letterSpacing unsupported");

  const setFont = (ctx, px) => {
    ctx.font = `700 ${px}px 'DM Sans'`;
    ctx.letterSpacing = letterSpacing;
    ctx.textBaseline = "alphabetic";
  };
  const measure = (px) => {
    setFont(sctx, px);
    return lines.map((text) => {
      const m = sctx.measureText(text);
      return { text, left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight };
    });
  };

  const refWidth = Math.max(...measure(100).map((m) => m.left + m.right));
  let px = ((size * visible * widthShare) / refWidth) * 100;

  const paint = (ctx, dx, dy) => {
    setFont(ctx, px);
    ctx.fillStyle = color;
    measure(px).forEach((m, i) => {
      const inkWidth = m.left + m.right;
      ctx.fillText(
        m.text,
        size / 2 - inkWidth / 2 + m.left + dx,
        size / 2 + i * px * linePitch + dy,
      );
    });
  };
  const inkBox = () => {
    sctx.clearRect(0, 0, size, size);
    paint(sctx, 0, 0);
    const { data } = sctx.getImageData(0, 0, size, size);
    let x0 = size,
      y0 = size,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[(y * size + x) * 4 + 3] === 0) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };

  // Center by ink, then shrink until the ink box's corners sit inside the
  // safe circle. Ink box, not line boxes: the descender of "g" and the
  // ascenders of "d" and "b" are what the mask would clip.
  let box = inkBox();
  const safeRadius = (size * safe) / 2;
  const cornerRadius = () => Math.hypot(box.w / 2, box.h / 2);
  if (cornerRadius() > safeRadius) {
    px *= safeRadius / cornerRadius();
    box = inkBox();
  }
  const dx = size / 2 - (box.x + box.w / 2);
  const dy = size / 2 - (box.y + box.h / 2);

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }
  paint(ctx, dx, dy);
  return {
    dataUrl: out.toDataURL("image/png"),
    fontPx: Math.round(px),
    ink: { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h },
  };
}

// Same cells, gaps, radii and static opacities as AnimatedDubGridLogo.
function drawGridMark({ size, scale, color }) {
  const px = size * scale;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  const cell = px / 4;
  const gap = cell * 0.1;
  const inner = cell - gap * 2;
  const radius = cell * 0.2;
  ctx.fillStyle = color;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      ctx.globalAlpha = row === 0 || col === 0 ? 1 : row + col <= 4 ? 0.75 : 0.3;
      ctx.beginPath();
      ctx.roundRect(col * cell + gap, row * cell + gap, inner, inner, radius);
      ctx.fill();
    }
  }
  return canvas.toDataURL("image/png");
}

function drawPreview({ ios, androidForeground, size, blue, visible }) {
  const tile = 256;
  const small = 60;
  const gap = 40;
  const specs = [
    { label: "iOS", kind: "ios" },
    { label: "Android circle", kind: "circle" },
    { label: "Android squircle", kind: "squircle" },
    { label: "Android rounded", kind: "rounded" },
    { label: "Android themed", kind: "themed" },
  ];
  const canvas = document.createElement("canvas");
  canvas.width = gap + specs.length * (tile + gap);
  canvas.height = gap + tile + 48 + small + gap;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0F172A";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const iosImg = new Image();
  const fgImg = new Image();
  const loaded = Promise.all(
    [iosImg, fgImg].map((img) => new Promise((resolve) => (img.onload = resolve))),
  );
  iosImg.src = ios;
  fgImg.src = androidForeground;

  const squircle = (x, y, s, n) => {
    ctx.beginPath();
    const r = s / 2;
    for (let i = 0; i <= 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      const c = Math.cos(t),
        sn = Math.sin(t);
      const px = x + r + Math.sign(c) * r * Math.abs(c) ** (2 / n);
      const py = y + r + Math.sign(sn) * r * Math.abs(sn) ** (2 / n);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  const clipFor = (kind, x, y, s) => {
    ctx.beginPath();
    if (kind === "ios") ctx.roundRect(x, y, s, s, s * 0.2237);
    else if (kind === "circle" || kind === "themed")
      ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
    else if (kind === "squircle") squircle(x, y, s, 5);
    else ctx.roundRect(x, y, s, s, s * 0.15);
    ctx.clip();
  };
  // The launcher crops the adaptive canvas to its central `visible` share, so
  // the foreground is drawn larger than the tile and centered on it.
  const drawTile = (kind, x, y, s) => {
    ctx.save();
    clipFor(kind, x, y, s);
    if (kind === "ios") {
      ctx.drawImage(iosImg, x, y, s, s);
    } else {
      const themed = kind === "themed";
      ctx.fillStyle = themed ? "#DCE4FF" : blue;
      ctx.fillRect(x, y, s, s);
      const full = s / visible;
      const off = (full - s) / 2;
      if (themed) {
        const tint = document.createElement("canvas");
        tint.width = size;
        tint.height = size;
        const tctx = tint.getContext("2d");
        tctx.drawImage(fgImg, 0, 0);
        tctx.globalCompositeOperation = "source-in";
        tctx.fillStyle = "#1E3A8A";
        tctx.fillRect(0, 0, size, size);
        ctx.drawImage(tint, x - off, y - off, full, full);
      } else {
        ctx.drawImage(fgImg, x - off, y - off, full, full);
      }
    }
    ctx.restore();
  };

  return loaded.then(() => {
    ctx.fillStyle = "#94A3B8";
    ctx.font = "500 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    specs.forEach((spec, i) => {
      const x = gap + i * (tile + gap);
      drawTile(spec.kind, x, gap, tile);
      ctx.fillText(spec.label, x + tile / 2, gap + tile + 28);
      drawTile(spec.kind, x + tile / 2 - small / 2, gap + tile + 48, small);
    });
    return canvas.toDataURL("image/png");
  });
}

function pngBuffer(dataUrl) {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function main() {
  const previewFlag = process.argv.indexOf("--preview");
  const previewPath = previewFlag === -1 ? null : process.argv[previewFlag + 1];
  if (previewFlag !== -1 && !previewPath) throw new Error("--preview needs a path");

  const fontBase64 = readFileSync(fontPath).toString("base64");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(
    `<!doctype html><style>@font-face{font-family:'DM Sans';font-weight:700;` +
      `src:url(data:font/ttf;base64,${fontBase64})}</style>`,
  );
  await page.evaluate(() => document.fonts.load("700 100px 'DM Sans'"));

  const rendered = {};
  for (const icon of ICONS) {
    const result = await page.evaluate(drawIcon, {
      size: SIZE,
      background: icon.background,
      color: WHITE,
      visible: icon.visible,
      safe: icon.safe,
      widthShare: WORDMARK_WIDTH,
      linePitch: LINE_PITCH,
      letterSpacing: LETTER_SPACING,
    });
    writeFileSync(join(imagesDir, icon.name), pngBuffer(result.dataUrl));
    rendered[icon.name] = result.dataUrl;
    const { ink } = result;
    console.log(
      `✓ ${icon.name}: DM Sans ${result.fontPx}px, ink ${Math.round(ink.w)}x${Math.round(ink.h)} ` +
        `at (${Math.round(ink.x)}, ${Math.round(ink.y)})`,
    );
  }

  for (const splash of SPLASHES) {
    const dataUrl = await page.evaluate(drawGridMark, {
      size: SPLASH_MARK_SIZE,
      scale: SPLASH_SCALE,
      color: splash.color,
    });
    writeFileSync(join(imagesDir, splash.name), pngBuffer(dataUrl));
    console.log(`✓ ${splash.name}: grid mark ${SPLASH_MARK_SIZE}dp in ${splash.color}`);
  }

  if (previewPath) {
    const dataUrl = await page.evaluate(drawPreview, {
      ios: rendered["icon.png"],
      androidForeground: rendered["adaptive-icon.png"],
      size: SIZE,
      blue: BRAND_BLUE,
      visible: ANDROID_VISIBLE,
    });
    writeFileSync(previewPath, pngBuffer(dataUrl));
    console.log(`✓ preview: ${previewPath}`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
