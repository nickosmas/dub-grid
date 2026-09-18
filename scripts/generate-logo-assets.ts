/**
 * Renders every raster form of the dubgrid mark from one definition.
 *
 * The mark is four rounded squares in a pinwheel, so it needs no font, no
 * tracing and no design tool: the geometry here is the same one
 * `apps/web/src/components/Logo.tsx` and the mobile `DubGridLogo` draw, kept
 * in one place so a future change to the mark cannot land on some surfaces and
 * miss others.
 *
 * Coverage is supersampled and box-filtered rather than drawn with a canvas,
 * which keeps this dependency free: the repo has no rasterizer installed and
 * this is not worth adding one for.
 *
 * Run with `npx tsx scripts/generate-logo-assets.ts`.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** Solid diagonal runs top-right to bottom-left; the other pair is tinted. */
const RECESSIVE_CELL_OPACITY = 0.3;
const GAP_RATIO = 0.045;
const RADIUS_RATIO = 0.2;
const SUPERSAMPLE = 4;

const BRAND: RGB = [0x25, 0x63, 0xeb];
const WHITE: RGB = [0xff, 0xff, 0xff];

type RGB = [number, number, number];

interface MarkOptions {
  size: number;
  /** The mark's own colour. */
  color: RGB;
  /** Painted behind the mark. Omit for a transparent ground. */
  background?: RGB;
  /** Fraction of the canvas the mark leaves empty on each side. */
  padding?: number;
}

function roundedSquareCoverage(
  px: number,
  py: number,
  x: number,
  y: number,
  size: number,
  radius: number,
): boolean {
  const localX = px - x;
  const localY = py - y;
  if (localX < 0 || localY < 0 || localX > size || localY > size) return false;

  const cornerX =
    localX < radius ? radius - localX : localX > size - radius ? localX - (size - radius) : 0;
  const cornerY =
    localY < radius ? radius - localY : localY > size - radius ? localY - (size - radius) : 0;
  if (cornerX === 0 || cornerY === 0) return true;
  return cornerX * cornerX + cornerY * cornerY <= radius * radius;
}

function renderMark({ size, color, background, padding = 0 }: MarkOptions): Buffer {
  const inset = size * padding;
  const markSize = size - inset * 2;
  const gap = markSize * GAP_RATIO;
  const cell = (markSize - gap) / 2;
  const radius = cell * RADIUS_RATIO;
  const offset = cell + gap;
  const cells = [
    { x: inset, y: inset, opacity: RECESSIVE_CELL_OPACITY },
    { x: inset + offset, y: inset, opacity: 1 },
    { x: inset, y: inset + offset, opacity: 1 },
    { x: inset + offset, y: inset + offset, opacity: RECESSIVE_CELL_OPACITY },
  ];

  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / SUPERSAMPLE;
  const samplesPerPixel = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      // Coverage per opacity level, so the two diagonals stay distinct where
      // a cell's antialiased edge lands inside the same pixel.
      let solid = 0;
      let tinted = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const sampleX = px + (sx + 0.5) * step;
          const sampleY = py + (sy + 0.5) * step;
          for (const rect of cells) {
            if (roundedSquareCoverage(sampleX, sampleY, rect.x, rect.y, cell, radius)) {
              if (rect.opacity === 1) solid += 1;
              else tinted += 1;
              break;
            }
          }
        }
      }

      const markAlpha = (solid + tinted * RECESSIVE_CELL_OPACITY) / samplesPerPixel;
      const index = (py * size + px) * 4;

      if (background) {
        for (let channel = 0; channel < 3; channel += 1) {
          pixels[index + channel] = Math.round(
            color[channel] * markAlpha + background[channel] * (1 - markAlpha),
          );
        }
        pixels[index + 3] = 255;
      } else {
        pixels[index] = color[0];
        pixels[index + 1] = color[1];
        pixels[index + 2] = color[2];
        pixels[index + 3] = Math.round(markAlpha * 255);
      }
    }
  }

  return encodePng(pixels, size, size);
}

function encodePng(pixels: Buffer, width: number, height: number): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}

const root = resolve(import.meta.dirname, "..");

const assets: Array<{ path: string; options: MarkOptions }> = [
  // Mobile. The iOS icon cannot be transparent, so it takes a white ground and
  // the platform's own padding; everything else stays transparent.
  {
    path: "apps/mobile/assets/images/icon.png",
    options: { size: 1024, color: BRAND, background: WHITE, padding: 0.18 },
  },
  {
    path: "apps/mobile/assets/images/icon-blue-on-white.png",
    options: { size: 1024, color: BRAND, background: WHITE, padding: 0.18 },
  },
  {
    path: "apps/mobile/assets/images/splash-icon.png",
    options: { size: 1024, color: BRAND, padding: 0.25 },
  },
  // Android trims the outer third of an adaptive icon, so the mark sits well inside.
  {
    path: "apps/mobile/assets/images/adaptive-icon.png",
    options: { size: 1024, color: BRAND, padding: 0.29 },
  },
  {
    path: "apps/mobile/assets/images/adaptive-icon-monochrome.png",
    options: { size: 1024, color: WHITE, padding: 0.29 },
  },
  { path: "apps/mobile/assets/images/logo-blue.png", options: { size: 1024, color: BRAND } },
  { path: "apps/mobile/assets/images/logo-white.png", options: { size: 1024, color: WHITE } },
  // Web.
  { path: "apps/web/public/logo.png", options: { size: 512, color: BRAND } },
  { path: "apps/web/public/logo-white.png", options: { size: 512, color: WHITE } },
  { path: "apps/web/src/app/icon.png", options: { size: 32, color: BRAND } },
  {
    path: "apps/web/src/app/apple-icon.png",
    options: { size: 180, color: BRAND, background: WHITE, padding: 0.16 },
  },
];

for (const asset of assets) {
  writeFileSync(resolve(root, asset.path), renderMark(asset.options));
  console.log(`wrote ${asset.path} (${asset.options.size}px)`);
}
