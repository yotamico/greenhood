"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp, logActivity } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode,     setMode]     = useState<"login" | "signup">("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

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
};
