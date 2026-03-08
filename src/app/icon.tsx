import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  const cells = [];
  const color = "#1B3A2D";
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      let opacity = 0.3;
      if (row === 0 || col === 0) opacity = 1;
      else if (row + col <= 4) opacity = 0.75;

      cells.push({ row, col, opacity });
    }
  }

  const sizeValue = 32;
  const cell = sizeValue / 4;
  const gap = cell * 0.18;
  const r = cell * 0.22;

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          position: "relative",
          background: "transparent",
        }}
      >
        {cells.map(({ row, col, opacity }) => (
          <div
            key={`${row}-${col}`}
            style={{
              position: "absolute",
              left: col * cell + gap,
              top: row * cell + gap,
              width: cell - gap * 2,
              height: cell - gap * 2,
              borderRadius: r,
              background: color,
              opacity,
            }}
          />
        ))}
      </div>
    ),
    { ...size },
  );
}
