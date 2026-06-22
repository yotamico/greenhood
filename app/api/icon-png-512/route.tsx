import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: "#1E3A22",
          borderRadius: 128,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "16px solid #2D2A24",
        }}
      >
        <div
          style={{
            width: 300,
            height: 300,
            background: "#6B9956",
            borderRadius: "50% 50% 50% 10%",
            border: "14px solid #F5F2E8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              color: "#F5F2E8",
              fontSize: 150,
              fontWeight: 900,
              lineHeight: 1,
              marginTop: -10,
            }}
          >
            G
          </div>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
