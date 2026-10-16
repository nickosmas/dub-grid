/**
 * Renders the mobile launcher, launch and logo images into
 * apps/mobile/assets/images/ from the shared stacked three-card geometry in
 * @dubgrid/design-tokens.
 *
 * App icons are the symbol in its on-brand colors (a white center card) on brand
 * blue, centered (the outline is symmetric under a half turn):
 *   - icon.png                      iOS, opaque blue field behind Apple's squircle
 *   - adaptive-icon.png             Android foreground layer, on transparent
 *   - adaptive-icon-monochrome.png  Android themed-icon layer, one color
 * Android shows the central 72/108 of an adaptive icon and guarantees only the
 * inner 66/108 circle, so the symbol's corners are kept inside that circle.
 *
 * Launch images are the first frame of the JS splash: the symbol in the
 * shared square box, `SPLASH_MARK_SIZE` wide, so the native splash hands off
 * without a visible seam.
 *   - splash-icon.png / splash-icon-dark.png
 *
 * Logos:
 *   - brand-mark-back.png, brand-mark-center.png, brand-mark-front.png
 *                                   the three cards as white layers cropped to
 *                                   the ink, each with the gap cut around the
 *                                   cards in front of it (`-small` variants
 *                                   for 32 px and below); the app tints each
 *                                   layer
 *   - logo-blue.png / logo-white.png and icon-blue-on-white.png
 *   - brand-mark-card.png, brand-mark-halo.png, brand-mark-halo-side.png
 *                                   one full-size white card in the shared
 *                                   card box, alone and grown by the gap
 *                                   (for a full card, and for a side card
 *                                   drawn at its scale), for the animated
 *                                   mark's frames
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
  BRAND_SYMBOL_CARD_BOX,
  BRAND_SYMBOL_CARDS,
  BRAND_SYMBOL_COLORS,
  BRAND_SYMBOL_GAP,
  BRAND_SYMBOL_INK,
  BRAND_SYMBOL_SQUARE,
  brandSymbolCardPath,
  getBrandSymbolPaths,
} = await import(
  pathToFileURL(
    join(scriptDir, "..", "..", "..", "packages", "design-tokens", "dist", "brand-mark.js"),
  ).href
);

const SIZE = 1024;
const WHITE = "#FFFFFF";
const ON_BRAND = BRAND_SYMBOL_COLORS.onBrand;
const LIGHT = BRAND_SYMBOL_COLORS.light;
const BRAND_BLUE = LIGHT.center;
const oneColor = (color) => ({ side: color, center: color });

const ANDROID_VISIBLE = 72 / 108;
const ANDROID_SAFE = 66 / 108;

// Symbol ink width as a share of what the launcher shows, so it reads at the
// same scale inside the iOS squircle and the Android circle.
const SYMBOL_WIDTH = 0.62;

// Mirrors BRAND_ANIMATED_LOGO_SIZE in @dubgrid/design-tokens. Keep in step
// with `imageWidth` in app.json.
const SPLASH_MARK_SIZE = 96;
const SPLASH_SCALE = 10;

const { width: INK_W, height: INK_H } = BRAND_SYMBOL_INK;
const MASK_REGION = `x="-20" y="-20" width="${INK_W + 40}" height="${INK_H + 40}"`;

// The gaps are masked out of the cards behind, so the images stay transparent
// there and sit on any background. `only` limits the drawing to one card (0
// back, 1 center, 2 front), for the layers the app tints separately.
function symbolSvg({ viewBox, width, height, colors, gap = BRAND_SYMBOL_GAP.regular, only }) {
  const cards = getBrandSymbolPaths(gap);
  const drawn = cards
    .map((card, i) => ({ ...card, i }))
    .filter(({ i }) => only === undefined || i === only);
  const masks = drawn
    .filter((card) => card.cut.length)
    .map(
      (card) => `<mask id="gap${card.i}" maskUnits="userSpaceOnUse" ${MASK_REGION}>
    <rect ${MASK_REGION} fill="#fff"/>
    ${card.cut.map((d) => `<path d="${d}" fill="#000"/>`).join("")}
  </mask>`,
    )
    .join("\n  ");
  const paths = drawn
    .map(
      (card) =>
        `<path d="${card.path}" fill="${colors[card.tone]}"${card.cut.length ? ` mask="url(#gap${card.i})"` : ""}/>`,
    )
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(" ")}" width="${width}" height="${height}">
  ${masks}
  ${paths}
</svg>`;
}

const SQUARE_BOX = [
  BRAND_SYMBOL_SQUARE.x,
  BRAND_SYMBOL_SQUARE.y,
  BRAND_SYMBOL_SQUARE.size,
  BRAND_SYMBOL_SQUARE.size,
];
const INK_BOX = [0, 0, INK_W, INK_H];

/**
 * A square view box that puts the symbol's ink at `share` of the visible
 * width, centered, shrunk if its corners would leave the safe circle.
 */
function iconBox({ visible, safe }) {
  const half = Math.hypot(INK_W / 2, INK_H / 2);
  const inkShare = Math.min(SYMBOL_WIDTH * visible, (safe / 2) * (INK_W / half));
  const size = INK_W / inkShare;
  return [INK_W / 2 - size / 2, INK_H / 2 - size / 2, size, size];
}

const layer = (name, only, gap) => ({
  name,
  size: 512,
  height: Math.round((512 * INK_H) / INK_W),
  svg: { viewBox: INK_BOX, colors: oneColor(WHITE), gap, only },
});

// One full-size card in the shared card box, alone or grown by the gap, for
// the animated mark, which places, scales and tints each card itself.
const CARD_BOX = BRAND_SYMBOL_CARD_BOX;
const cardImage = (name, grow) => ({
  name,
  size: 512,
  height: Math.round((512 * CARD_BOX.height) / CARD_BOX.width),
  draw: ({ width, height }) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[CARD_BOX.x, CARD_BOX.y, CARD_BOX.width, CARD_BOX.height].join(" ")}" width="${width}" height="${height}">
  <path d="${brandSymbolCardPath({ cx: 0, cy: 0, grow })}" fill="${WHITE}"/>
</svg>`,
});

const ANDROID_BOX = iconBox({ visible: ANDROID_VISIBLE, safe: ANDROID_SAFE });

const IMAGES = [
  {
    name: "icon.png",
    size: SIZE,
    background: BRAND_BLUE,
    svg: { viewBox: iconBox({ visible: 1, safe: 1 }), colors: ON_BRAND },
  },
  { name: "adaptive-icon.png", size: SIZE, svg: { viewBox: ANDROID_BOX, colors: ON_BRAND } },
  {
    name: "adaptive-icon-monochrome.png",
    size: SIZE,
    svg: { viewBox: ANDROID_BOX, colors: oneColor(WHITE), gap: BRAND_SYMBOL_GAP.oneColor },
  },
  {
    name: "icon-blue-on-white.png",
    size: SIZE,
    background: WHITE,
    svg: { viewBox: iconBox({ visible: 1, safe: 1 }), colors: LIGHT },
  },
  {
    name: "splash-icon.png",
    size: SPLASH_MARK_SIZE * SPLASH_SCALE,
    svg: { viewBox: SQUARE_BOX, colors: LIGHT },
  },
  {
    name: "splash-icon-dark.png",
    size: SPLASH_MARK_SIZE * SPLASH_SCALE,
    svg: { viewBox: SQUARE_BOX, colors: BRAND_SYMBOL_COLORS.dark },
  },
  { name: "logo-blue.png", size: SIZE, svg: { viewBox: SQUARE_BOX, colors: LIGHT } },
  { name: "logo-white.png", size: SIZE, svg: { viewBox: SQUARE_BOX, colors: ON_BRAND } },
  layer("brand-mark-back.png", 0, BRAND_SYMBOL_GAP.regular),
  layer("brand-mark-back-small.png", 0, BRAND_SYMBOL_GAP.small),
  layer("brand-mark-center.png", 1, BRAND_SYMBOL_GAP.regular),
  layer("brand-mark-center-small.png", 1, BRAND_SYMBOL_GAP.small),
  layer("brand-mark-front.png", 2),
  cardImage("brand-mark-card.png", 0),
  cardImage("brand-mark-halo.png", BRAND_SYMBOL_GAP.regular),
  cardImage("brand-mark-halo-side.png", BRAND_SYMBOL_GAP.regular / BRAND_SYMBOL_CARDS[0].scale),
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
      svg: image.draw ? image.draw({ width, height }) : symbolSvg({ ...image.svg, width, height }),
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
