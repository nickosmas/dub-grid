"use client";

import { useRouter } from "next/navigation";

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0F172A",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        color: "#F8FAFC",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="DubGrid" width={40} height={40} />
          <span
            style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}
          >
            DubGrid
          </span>
        </div>
      </header>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
          textAlign: "center",
          gap: 48,
        }}
      >
        <div
          style={{
            maxWidth: 600,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <h1
            style={{
              fontSize: "clamp(36px, 5vw, 56px)",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              margin: 0,
            }}
          >
            Smart Staff{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #38BDF8, #818CF8)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Scheduling
            </span>
          </h1>
          <p
            style={{
              fontSize: 18,
              color: "#94A3B8",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Effortless shift planning for care facilities. Build schedules,
            manage staff, and keep your team organized — all in one place.
          </p>
        </div>

        {/* Login Buttons */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            width: "100%",
            maxWidth: 320,
          }}
        >
          <button
            onClick={() => router.push("/login")}
            style={{
              width: "100%",
              padding: "14px 24px",
              background: "linear-gradient(135deg, #38BDF8, #818CF8)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              transition: "opacity 0.2s, transform 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = "0.9";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Staff Login
          </button>

          <button
            onClick={() => router.push("/admin/login")}
            style={{
              width: "100%",
              padding: "14px 24px",
              background: "transparent",
              color: "#94A3B8",
              border: "1px solid #334155",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              transition: "border-color 0.2s, color 0.2s, transform 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "#818CF8";
              e.currentTarget.style.color = "#C4B5FD";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "#334155";
              e.currentTarget.style.color = "#94A3B8";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Admin Portal
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "24px 32px",
          textAlign: "center",
          fontSize: 13,
          color: "#475569",
        }}
      >
        © {new Date().getFullYear()} DubGrid
      </footer>
    </div>
  );
}
