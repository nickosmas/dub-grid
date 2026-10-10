/**
 * Renders the mobile launcher, launch and logo images into
 * apps/mobile/assets/images/ from the shared two-card geometry in
 * @dubgrid/design-tokens.
 *
 * App icons are the white symbol on brand blue, optically centered (the solid
 * front card would otherwise pull it right of center):
 *   - icon.png                      iOS, opaque blue field behind Apple's squircle
 *   - adaptive-icon.png             Android foreground layer, white on transparent
 *   - adaptive-icon-monochrome.png  Android themed-icon layer, same shapes
 * Android shows the central 72/108 of an adaptive icon and guarantees only the
 * inner 66/108 circle, so the symbol's corners are kept inside that circle.
 *
 * Launch images are the first frame of the JS splash: the symbol in the
 * shared square box, `SPLASH_MARK_SIZE` wide, so the native splash hands off
 * without a visible seam.
 *   - splash-icon.png / splash-icon-dark.png
 *
 * Logos:
 *   - brand-mark.png                white, cropped to the ink; the app tints it
 *   - logo-blue.png / logo-white.png and icon-blue-on-white.png
 *
 * Build the packages first (`npm run build:packages`), then run `npm run
 * icons` in apps/mobile, then `npx expo prebuild` and rebuild the dev client
 * so the native asset catalogs pick the files up. `--preview <path>` also
 * writes a sheet of the icons under each platform's mask.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(scriptDir, "..", "assets", "images");

// The package's index is bundler-only, but this module has no imports, so
// plain Node can load it straight from the build output.
const {
  BRAND_MARK_BACK,
  BRAND_MARK_BACK_STROKE,
  BRAND_MARK_COLORS,
  BRAND_MARK_FRONT,
  BRAND_MARK_GAP,
  BRAND_MARK_INK,
  BRAND_MARK_OPTICAL_OFFSET_X,
  BRAND_MARK_SQUARE,
  brandMarkCardPath,
} = await import(
  pathToFileURL(
    join(scriptDir, "..", "..", "..", "packages", "design-tokens", "dist", "brand-mark.js"),
  ).href
);

const SIZE = 1024;
const WHITE = BRAND_MARK_COLORS.onBrand;
const BRAND_BLUE = BRAND_MARK_COLORS.light;

const ANDROID_VISIBLE = 72 / 108;
const ANDROID_SAFE = 66 / 108;

// Symbol ink width as a share of what the launcher shows, so it reads at the
// same scale inside the iOS squircle and the Android circle.
const SYMBOL_WIDTH = 0.62;

// Mirrors BRAND_ANIMATED_LOGO_SIZE in @dubgrid/design-tokens. Keep in step
// with `imageWidth` in app.json.
const SPLASH_MARK_SIZE = 96;
const SPLASH_SCALE = 10;

const BACK_PATH = brandMarkCardPath(BRAND_MARK_BACK);
const FRONT_PATH = brandMarkCardPath(BRAND_MARK_FRONT);

// The gap is masked out of the back card, so the images stay transparent
// there and sit on any background.
function symbolSvg({ viewBox, width, height, color }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(" ")}" width="${width}" height="${height}">
  <mask id="gap" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">
    <rect x="-20" y="-20" width="140" height="140" fill="#fff"/>
    <path d="${FRONT_PATH}" fill="#000" stroke="#000" stroke-width="${BRAND_MARK_GAP * 2}"/>
  </mask>
  <path d="${BACK_PATH}" fill="none" stroke="${color}" stroke-width="${BRAND_MARK_BACK_STROKE}" mask="url(#gap)"/>
  <path d="${FRONT_PATH}" fill="${color}"/>
</svg>`;
}

const SQUARE_BOX = [
  BRAND_MARK_SQUARE.x,
  BRAND_MARK_SQUARE.y,
  BRAND_MARK_SQUARE.size,
  BRAND_MARK_SQUARE.size,
];
const INK_BOX = [BRAND_MARK_INK.x, BRAND_MARK_INK.y, BRAND_MARK_INK.width, BRAND_MARK_INK.height];

/**
 * A square view box that puts the symbol's ink at `share` of the visible
 * width, optically centered, shrunk if its corners would leave the safe circle.
 */
function iconBox({ visible, safe }) {
  const half = Math.hypot(BRAND_MARK_INK.width / 2, BRAND_MARK_INK.height / 2);
  const inkShare = Math.min(SYMBOL_WIDTH * visible, (safe / 2) * (BRAND_MARK_INK.width / half));
  const size = BRAND_MARK_INK.width / inkShare;
  const centerX = BRAND_MARK_INK.x + BRAND_MARK_INK.width / 2 + BRAND_MARK_OPTICAL_OFFSET_X;
  const centerY = BRAND_MARK_INK.y + BRAND_MARK_INK.height / 2;
  return [centerX - size / 2, centerY - size / 2, size, size];
}

const IMAGES = [
  {
    name: "icon.png",
    size: SIZE,
    background: BRAND_BLUE,
    svg: { viewBox: iconBox({ visible: 1, safe: 1 }), color: WHITE },
  },
  {
    name: "adaptive-icon.png",
    size: SIZE,
    svg: { viewBox: iconBox({ visible: ANDROID_VISIBLE, safe: ANDROID_SAFE }), color: WHITE },
  },
  {
    name: "adaptive-icon-monochrome.png",
    size: SIZE,
    svg: { viewBox: iconBox({ visible: ANDROID_VISIBLE, safe: ANDROID_SAFE }), color: WHITE },
  },
  {
    name: "icon-blue-on-white.png",
    size: SIZE,
    background: WHITE,
    svg: { viewBox: iconBox({ visible: 1, safe: 1 }), color: BRAND_BLUE },
  },
  {
    name: "splash-icon.png",
    size: SPLASH_MARK_SIZE * SPLASH_SCALE,
    svg: { viewBox: SQUARE_BOX, color: BRAND_MARK_COLORS.light },
  },
  {
    name: "splash-icon-dark.png",
    size: SPLASH_MARK_SIZE * SPLASH_SCALE,
    svg: { viewBox: SQUARE_BOX, color: BRAND_MARK_COLORS.dark },
  },
  { name: "logo-blue.png", size: SIZE, svg: { viewBox: SQUARE_BOX, color: BRAND_BLUE } },
  { name: "logo-white.png", size: SIZE, svg: { viewBox: SQUARE_BOX, color: WHITE } },
  {
    name: "brand-mark.png",
    size: 512,
    height: Math.round((512 * BRAND_MARK_INK.height) / BRAND_MARK_INK.width),
    svg: { viewBox: INK_BOX, color: WHITE },
  },
];

function drawImage({ width, height, background, svg }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
  });
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

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const rendered = {};
  for (const image of IMAGES) {
    const width = image.size;
    const height = image.height ?? image.size;
    const dataUrl = await page.evaluate(drawImage, {
      width,
      height,
      background: image.background ?? null,
      svg: symbolSvg({ ...image.svg, width, height }),
    });
    writeFileSync(join(imagesDir, image.name), pngBuffer(dataUrl));
    rendered[image.name] = dataUrl;
    console.log(`✓ ${image.name}: ${width}x${height}`);
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
