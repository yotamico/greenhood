"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const CATS = [
  { id:"furniture",   label:"ריהוט",       emoji:"🪑" },
  { id:"books",       label:"ספרים",       emoji:"📚" },
  { id:"lighting",    label:"תאורה",       emoji:"💡" },
  { id:"electronics", label:"אלקטרוניקה", emoji:"📺" },
  { id:"kitchen",     label:"מטבח",        emoji:"🍳" },
  { id:"sports",      label:"ספורט",       emoji:"⚽" },
  { id:"plants",      label:"צמחים",       emoji:"🌿" },
  { id:"kids",        label:"ילדים",       emoji:"🧸" },
];
const CONDITIONS = ["שלם","כמעט שלם","פגום אך שמיש","לחלקים","לשיפוץ"];
const PRESET_TAGS = ["וינטג׳","עץ","צריך 2 אנשים","פרק ורכב","כבד מאוד","פשוט להרים"];

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams();
  const id     = params.id as string;

  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [category,    setCategory]    = useState("furniture");
  const [condition,   setCondition]   = useState("good");
  const [address,     setAddress]     = useState("");
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data: it } = await supabase.from("items").select("*").eq("id", id).single();
      if (!it || it.reporter_id !== session.user.id) { router.replace(`/items/${id}`); return; }

      setTitle(it.title ?? "");
      setDescription(it.description ?? "");
      setCategory(it.category ?? "furniture");
      // map stored condition id to Hebrew label if needed
      const condMap: Record<string,string> = { new:"שלם", like_new:"כמעט שלם", good:"פגום אך שמיש", fair:"לחלקים" };
      const storedCond = it.condition ?? "good";
      setCondition(CONDITIONS.includes(storedCond) ? storedCond : (condMap[storedCond] ?? "שלם"));
      setAddress(it.address ?? "");
      setTags(it.tags ?? []);
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleSave() {
    if (!title.trim() || !address.trim()) return;
    setSaving(true);
    await supabase.from("items").update({
      title: title.trim(),
      description: description.trim() || null,
      category, condition,
      address: address.trim(),
      tags,
    }).eq("id", id);
    router.replace(`/items/${id}`);
  }

  async function handleDelete() {
    if (!confirm("למחוק את הפריט לצמיתות? לא ניתן לשחזר.")) return;
    setDeleting(true);
    await supabase.from("items").delete().eq("id", id);
    router.replace("/me");
  }

  const labelStyle: React.CSSProperties = {
    fontSize:10, fontWeight:800, letterSpacing:"0.08em",
    textTransform:"uppercase", color:"var(--muted)",
    marginBottom:10, direction:"rtl",
  };

  const inputStyle: React.CSSProperties = {
    width:"100%", padding:"12px 14px",
    background:"var(--surface)", border:"2px solid var(--ink)",
    borderRadius:12, fontFamily:"var(--font-sans)", fontSize:15,
    color:"var(--ink)", outline:"none", direction:"rtl",
    boxSizing:"border-box",
  };

  if (loading) return (
    <div style={{ minHeight:"100dvh", background:"var(--paper)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:40, animation:"floatY 1.4s ease-in-out infinite" }}>✏️</div>
    </div>
  );

  return (
    <div style={{ minHeight:"100dvh", background:"var(--paper)", fontFamily:"var(--font-sans)" }}>

      {/* Nav bar */}
      <div style={{
        position:"sticky", top:0, zIndex:30,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"12px 16px",
        background:"rgba(245,242,232,0.95)", backdropFilter:"blur(8px)",
        borderBottom:"1.5px solid var(--ink)",
      }}>
        <button onClick={() => router.back()} style={{
          width:38, height:38, borderRadius:"50%",
          background:"var(--surface)", border:"2px solid var(--ink)",
          display:"flex", alignItems:"center", justifyContent:"center",
          cursor:"pointer", padding:0, boxShadow:"var(--sh-sm)",
        }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
        <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:17, letterSpacing:"-0.01em" }}>
          עריכת פריט
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !address.trim()}
          style={{
            padding:"8px 16px", borderRadius:999,
            background: saving || !title.trim() || !address.trim() ? "var(--paper-2)" : "var(--primary)",
            color:"var(--ink)", border:"2px solid var(--ink)",
            fontFamily:"var(--font-sans)", fontWeight:700, fontSize:14,
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow:"var(--sh-sm)",
          }}
        >{saving ? "שומר…" : "שמור"}</button>
      </div>

      {/* Form */}
      <div style={{ padding:"20px 16px 120px", display:"flex", flexDirection:"column", gap:20 }}>

        {/* Title */}
        <div>
          <div style={labelStyle}>שם הפריט *</div>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="למשל: כורסת קטיפה ירוקה" style={inputStyle} />
        </div>

        {/* Description */}
        <div>
          <div style={labelStyle}>תיאור</div>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="מצב, גודל, פרטים נוספים…" rows={3}
            style={{ ...inputStyle, resize:"none", lineHeight:1.5 }} />
        </div>

        {/* Category — 4-col grid (matches report page) */}
        <div>
          <div style={labelStyle}>קטגוריה</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            {CATS.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)} style={{
                padding:"10px 4px",
                background: category===c.id ? "var(--primary)" : "var(--surface)",
                border:"2px solid var(--ink)", borderRadius:12,
                boxShadow: category===c.id ? "var(--sh-md)" : "var(--sh-sm)",
                cursor:"pointer", display:"flex", flexDirection:"column",
                alignItems:"center", gap:4, fontFamily:"var(--font-sans)",
                transition:"all 120ms",
              }}>
                <span style={{ fontSize:20 }}>{c.emoji}</span>
                <span style={{ fontSize:10, fontWeight:700 }}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Condition — scrollable pills (matches report page) */}
        <div>
          <div style={labelStyle}>מצב</div>
          <div style={{ display:"flex", gap:6, overflowX:"auto", marginInline:-16, paddingInline:16, scrollbarWidth:"none" }}>
            {CONDITIONS.map(c => (
              <button key={c} onClick={() => setCondition(c)} style={{
                padding:"7px 14px", height:34, flexShrink:0,
                background: condition===c ? "var(--ink)" : "var(--surface)",
                color: condition===c ? "var(--paper)" : "var(--ink)",
                border:"1.5px solid var(--ink)", borderRadius:999,
                fontFamily:"var(--font-sans)", fontWeight:700, fontSize:13,
                cursor:"pointer", whiteSpace:"nowrap",
                boxShadow: condition===c ? "2px 2px 0 var(--shadow-ink)" : "1px 1px 0 var(--shadow-ink)",
              }}>{c}</button>
            ))}
          </div>
        </div>

        {/* Tags — preset chips + custom input (matches report page) */}
        <div>
          <div style={labelStyle}>תגיות (לא חובה)</div>
          <div style={{ display:"flex", gap:6, overflowX:"auto", marginInline:-16, paddingInline:16, scrollbarWidth:"none", marginBottom:10 }}>
            {PRESET_TAGS.map(t => (
              <button key={t} onClick={() => setTags(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev,t])} style={{
                padding:"7px 14px", height:34, flexShrink:0,
                background: tags.includes(t) ? "var(--primary-tint)" : "var(--surface)",
                border: tags.includes(t) ? "2px solid var(--primary-dark)" : "1.5px solid var(--ink)",
                borderRadius:999, fontFamily:"var(--font-sans)", fontWeight:700, fontSize:13,
                cursor:"pointer", whiteSpace:"nowrap", color:"var(--ink)",
                boxShadow:"1px 1px 0 var(--shadow-ink)",
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Address */}
        <div>
          <div style={labelStyle}>כתובת *</div>
          <input value={address} onChange={e => setAddress(e.target.value)}
            placeholder="למשל: רחוב הרצל 14, נס ציונה" style={inputStyle} />
        </div>

        {/* Delete section */}
        <div style={{
          marginTop:8, padding:16,
          background:"var(--paper-2)", border:"2px solid var(--ink)",
          borderRadius:14, boxShadow:"var(--sh-sm)",
        }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4, direction:"rtl" }}>מחיקת פריט</div>
          <div style={{ fontSize:12, color:"var(--muted)", marginBottom:12, direction:"rtl" }}>
            פעולה זו בלתי הפיכה. הפריט יוסר לצמיתות.
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              width:"100%", padding:"12px 0",
              background: deleting ? "var(--muted)" : "var(--accent)",
              color:"white", border:"2px solid var(--ink)",
              borderRadius:12, fontFamily:"var(--font-sans)",
              fontWeight:700, fontSize:15, cursor: deleting ? "not-allowed" : "pointer",
              boxShadow:"var(--sh-sm)",
            }}
          >{deleting ? "מוחק…" : "🗑️ מחק פריט לצמיתות"}</button>
        </div>
      </div>

      {/* Sticky save button */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0,
        padding:"14px 16px calc(14px + env(safe-area-inset-bottom))",
        background:"var(--surface)", borderTop:"2px solid var(--ink)", zIndex:20,
      }}>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !address.trim()}
          style={{
            width:"100%", height:56,
            background: saving || !title.trim() || !address.trim() ? "var(--primary-tint)" : "var(--primary)",
            color:"var(--ink)", border:"2px solid var(--ink)", borderRadius:"var(--r-md)",
            fontFamily:"var(--font-sans)", fontWeight:700, fontSize:17,
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow:"var(--sh-md)",
            opacity: !title.trim() || !address.trim() ? 0.55 : 1,
          }}
        >{saving ? "שומר…" : "שמור שינויים ←"}</button>
      </div>
    </div>
  );
}
