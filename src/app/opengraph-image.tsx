import { ImageResponse } from "next/og";
import { LogoGrid } from "./logo-grid";

export const alt = "DubGrid — Smart staff scheduling for care facilities";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F8FAFC",
          gap: 48,
        }}
      >
        <LogoGrid size={200} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#0357CA",
              letterSpacing: -2,
            }}
          >
            DubGrid
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 400,
              color: "#475569",
            }}
          >
            Smart staff scheduling for care facilities
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
