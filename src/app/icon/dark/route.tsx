import { ImageResponse } from "next/og";
import { COLORS, LogoGrid } from "../../logo-grid";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(<LogoGrid size={32} color={COLORS.dark} />, {
    width: 32,
    height: 32,
  });
}
