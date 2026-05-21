"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp, logActivity, signInWithGoogle } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode,     setMode]     = useState<"login" | "signup">("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  async function handleGoogle() {
    setErr(null);
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) { setErr("שגיאה בהתחברות עם Google"); setLoading(false); }
    // On success, Supabase redirects the browser to Google — no further action needed here
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    if (mode === "login") {
      const { data, error } = await signIn(email, password);
      if (error) { setErr("אימייל או סיסמה שגויים"); setLoading(false); return; }
      if (data.user) {
        await logActivity(data.user.id, data.user.email!, "login");
      }
      router.replace("/");
    } else {
      if (password.length < 6) { setErr("סיסמה חייבת להכיל לפחות 6 תווים"); setLoading(false); return; }
      const { data, error } = await signUp(email, password);
      if (error) { setErr(error.message.includes("already") ? "אימייל זה כבר רשום" : "שגיאה בהרשמה"); setLoading(false); return; }
      if (data.user) {
        await logActivity(data.user.id, data.user.email!, "signup");
      }
      router.replace("/");
    }
  }

  return (
    <div style={s.root} dir="rtl">
      <div style={s.card}>
        <div style={s.logo}>🌿</div>
        <h1 style={s.appName}>מציאות</h1>
        <p style={s.appSub}>ניהול פסולת גושה — נס ציונה</p>

        {/* כניסה עם Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          style={{ ...s.googleBtn, opacity: loading ? 0.6 : 1 }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" style={{ flexShrink: 0 }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>המשך עם Google</span>
        </button>

        <div style={s.dividerRow}>
          <div style={s.dividerLine} />
          <span style={s.dividerText}>או</span>
          <div style={s.dividerLine} />
        </div>

        <div style={s.tabs}>
          <button
            style={{ ...s.tab, ...(mode === "login"  ? s.tabActive : {}) }}
            onClick={() => { setMode("login");  setErr(null); }}
          >כניסה</button>
          <button
            style={{ ...s.tab, ...(mode === "signup" ? s.tabActive : {}) }}
            onClick={() => { setMode("signup"); setErr(null); }}
          >הרשמה</button>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>אימייל</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            style={s.input}
            dir="ltr"
          />

          <label style={s.label}>סיסמה</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "לפחות 6 תווים" : "••••••••"}
            required
            style={s.input}
            dir="ltr"
          />

          {err && <p style={s.err}>{err}</p>}

          <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.6 : 1 }}>
            {loading ? "..." : mode === "login" ? "כניסה" : "הרשמה"}
          </button>
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100dvh",
    background: "#0f1117",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Heebo', sans-serif",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    background: "#1a1d27",
    border: "1px solid #2e3348",
    borderRadius: 20,
    padding: "36px 28px 32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
  },
  logo:    { fontSize: 52, marginBottom: 8 },
  appName: { fontSize: 26, fontWeight: 900, color: "#e8eaf2", margin: 0 },
  appSub:  { fontSize: 13, color: "#7880a0", margin: "6px 0 24px", textAlign: "center" },
  tabs: {
    display: "flex",
    width: "100%",
    background: "#0f1117",
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  tab: {
    flex: 1,
    padding: "8px 0",
    borderRadius: 7,
    border: "none",
    background: "transparent",
    color: "#7880a0",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
    transition: "all 0.15s",
  },
  tabActive: {
    background: "#1a1d27",
    color: "#e8eaf2",
    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
  },
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#b0b8d4",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    width: "100%",
    background: "#0f1117",
    border: "1px solid #2e3348",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 15,
    color: "#e8eaf2",
    fontFamily: "'Heebo', sans-serif",
    outline: "none",
    boxSizing: "border-box",
  },
  err: {
    color: "#f87171",
    fontSize: 13,
    margin: "10px 0 0",
    textAlign: "center",
  },
  btn: {
    marginTop: 22,
    width: "100%",
    background: "#38e07b",
    color: "#0f1117",
    border: "none",
    borderRadius: 12,
    padding: "14px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
    transition: "opacity 0.15s",
  },
  googleBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    background: "#fff",
    color: "#1f1f1f",
    border: "1px solid #dadce0",
    borderRadius: 12,
    padding: "13px 16px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
    transition: "opacity 0.15s",
    marginBottom: 4,
  },
  dividerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    margin: "16px 0",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "#2e3348",
  },
  dividerText: {
    fontSize: 13,
    color: "#7880a0",
    fontWeight: 600,
    flexShrink: 0,
  },
};
