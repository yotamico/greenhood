"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp, signInWithGoogle } from "@/lib/supabase";

/* ── tiny inline sticker component ─────────────────────── */
function Sticker({
  emoji, color, style,
}: {
  emoji: string; color: string; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      position: "absolute",
      width: 56, height: 56,
      background: color,
      borderRadius: 14,
      border: "2px solid var(--ink)",
      boxShadow: "3px 3px 0 var(--shadow-ink)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 26,
      animation: "floatY 2.8s ease-in-out infinite",
      ...style,
    }}>{emoji}</div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode]         = useState<"login" | "signup">("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  async function handleGoogle() {
    setErr(null);
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setErr("שגיאה בהתחברות עם Google");
      setLoading(false);
    }
    // Supabase redirects to /auth/callback on success
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) {
        setErr("אימייל או סיסמה שגויים");
        setLoading(false);
        return;
      }
      router.replace("/welcome");
    } else {
      if (password.length < 6) {
        setErr("סיסמה חייבת להכיל לפחות 6 תווים");
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password);
      if (error) {
        setErr(error.message.includes("already") ? "אימייל זה כבר רשום" : "שגיאה בהרשמה");
        setLoading(false);
        return;
      }
      router.replace("/welcome");
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--paper)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 20px",
      position: "relative",
      overflow: "hidden",
      fontFamily: "var(--font-sans)",
    }}>
      {/* floating background stickers */}
      <Sticker emoji="🪑" color="var(--warning-tint)" style={{ top: "8%",  right: "6%",  animationDelay: "0s",   transform: "rotate(-10deg)" }} />
      <Sticker emoji="📚" color="var(--accent-tint)"  style={{ top: "14%", left:  "5%",  animationDelay: "0.6s", transform: "rotate(8deg)"  }} />
      <Sticker emoji="🌿" color="var(--primary-light)" style={{ bottom: "18%", left: "4%", animationDelay: "1.2s", transform: "rotate(-6deg)" }} />
      <Sticker emoji="💡" color="var(--info-tint)"    style={{ bottom: "12%", right: "7%", animationDelay: "0.9s", transform: "rotate(12deg)" }} />

      {/* card */}
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "var(--surface)",
        border: "2px solid var(--ink)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--sh-xl)",
        padding: "36px 32px 40px",
        position: "relative",
        zIndex: 1,
      }}>
        {/* wordmark */}
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: "-0.035em",
            lineHeight: 1,
            color: "var(--ink)",
          }}>
            Green<span style={{ color: "var(--primary-dark)" }}>HOOD</span>
          </span>
        </div>

        <p style={{
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 14,
          fontWeight: 500,
          marginTop: 6,
          marginBottom: 32,
        }}>
          {mode === "login" ? "ברוך השב/ה 👋" : "הצטרף/י לקהילה 🌱"}
        </p>

        {/* Google btn */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: "100%",
            height: 48,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: "var(--surface)",
            border: "2px solid var(--ink)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--sh-md)",
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            fontSize: 15,
            color: "var(--ink)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            marginBottom: 20,
            transition: "transform 120ms, box-shadow 120ms",
          }}
          onMouseDown={e => { e.currentTarget.style.transform = "translate(2px,2px)"; e.currentTarget.style.boxShadow = "none"; }}
          onMouseUp={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--sh-md)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--sh-md)"; }}
        >
          {/* Google logo */}
          <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          המשך עם Google
        </button>

        {/* divider */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        }}>
          <div style={{ flex: 1, height: 1.5, background: "var(--line-strong)" }}/>
          <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 600 }}>או</span>
          <div style={{ flex: 1, height: 1.5, background: "var(--line-strong)" }}/>
        </div>

        {/* email form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" && (
            <input
              className="gh-input"
              type="text"
              placeholder="שם מלא"
              value={name}
              onChange={e => setName(e.target.value)}
              required={mode === "signup"}
            />
          )}
          <input
            className="gh-input"
            type="email"
            placeholder="אימייל"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            className="gh-input"
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {err && (
            <div style={{
              padding: "10px 14px",
              background: "var(--accent-tint)",
              border: "1.5px solid var(--accent)",
              borderRadius: "var(--r-md)",
              color: "var(--accent-dark)",
              fontSize: 13,
              fontWeight: 600,
            }}>{err}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              height: 52,
              background: loading ? "var(--primary-tint)" : "var(--primary)",
              color: "var(--ink)",
              border: "2px solid var(--ink)",
              borderRadius: "var(--r-md)",
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "var(--sh-md)",
              transition: "transform 120ms, box-shadow 120ms",
              marginTop: 4,
            }}
            onMouseDown={e => { if (!loading) { e.currentTarget.style.transform = "translate(2px,2px)"; e.currentTarget.style.boxShadow = "none"; }}}
            onMouseUp={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--sh-md)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--sh-md)"; }}
          >
            {loading ? "רגע…" : mode === "login" ? "כניסה ←" : "הרשמה ←"}
          </button>
        </form>

        {/* toggle mode */}
        <p style={{
          textAlign: "center",
          marginTop: 20,
          fontSize: 13,
          color: "var(--muted)",
          fontWeight: 500,
        }}>
          {mode === "login" ? "אין לך חשבון? " : "יש לך חשבון? "}
          <button
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(null); }}
            style={{
              background: "none", border: "none",
              color: "var(--primary-dark)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: "var(--font-sans)",
            }}
          >
            {mode === "login" ? "הרשמה" : "כניסה"}
          </button>
        </p>
      </div>
    </div>
  );
}
