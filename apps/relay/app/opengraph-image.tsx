import { ImageResponse } from "next/og";

export const alt = "Relay: every message, from one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card: the dark Relay canvas with the wordmark, the promise and the one lavender accent. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "linear-gradient(135deg, #0f1011 0%, #161718 60%, #1d2035 100%)",
          color: "#f7f8f8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 40, fontWeight: 600 }}>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: "#5e6ad2" }} />
          Relay
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05, display: "flex" }}>
            Every message, from one place.
          </div>
          <div style={{ fontSize: 32, color: "#9a9ca1", display: "flex" }}>
            Email, texts, WhatsApp and in-app messages, with every delivery in view.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
