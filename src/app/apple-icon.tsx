import { ImageResponse } from "next/og";
import { LogoGrid } from "./logo-grid";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          borderRadius: 40,
        }}
      >
        <LogoGrid size={140} />
      </div>
    ),
    { ...size },
  );
}
