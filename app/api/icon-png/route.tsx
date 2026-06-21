import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          background: "#1E3A22",
          borderRadius: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "6px solid #2D2A24",
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            background: "#6B9956",
            borderRadius: "50% 50% 50% 10%",
            border: "5px solid #F5F2E8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              color: "#F5F2E8",
              fontSize: 56,
              fontWeight: 900,
              lineHeight: 1,
              marginTop: -4,
            }}
          >
            G
          </div>
        </div>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
