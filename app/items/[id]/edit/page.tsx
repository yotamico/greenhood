"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const CATEGORIES = ["furniture","books","lighting","plants","sports","electronics","kitchen","kids"];
const CAT_LABEL: Record<string,string> = {
  furniture:"ריהוט", books:"ספרים", lighting:"תאורה", plants:"צמחים",
  sports:"ספורט", electronics:"אלקטרוניקה", kitchen:"מטבח", kids:"ילדים",
};
const CAT_EMOJI: Record<string,string> = {
  furniture:"🪑", books:"📚", lighting:"💡", plants:"🌿",
  sports:"⚽", electronics:"📺", kitchen:"🍳", kids:"🧸",
};
const CONDITIONS = [
  { id:"new",      label:"✨ חדש" },
  { id:"like_new", label:"👌 כמו חדש" },
  { id:"good",     label:"👍 טוב" },
  { id:"fair",     label:"🆗 סביר" },
];

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
  const [tagInput,    setTagInput]    = useState("");
  const [tags,        setTags]        = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data: it } = await supabase.from("items").select("*").eq("id", id).single();
      if (!it || it.reporter_id !== session.user.id) { router.replace(`/items/${id}`); return; }

      setTitle(it.title ?? "");
      setDescription(it.description ?? "");
      setCategory(it.category ?? "furniture");
      setCondition(it.condition ?? "good");
      setAddress(it.address ?? "");
      setTags(it.tags ?? []);
      setLoading(false);
    }
    load();
  }, [id, router]);

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  }

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
          <label style={{ display:"block", fontWeight:700, fontSize:13, marginBottom:6, direction:"rtl" }}>שם הפריט *</label>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="למשל: כורסת קטיפה ירוקה"
            style={inputStyle}
          />
        </div>

        {/* Description */}
        <div>
          <label style={{ display:"block", fontWeight:700, fontSize:13, marginBottom:6, direction:"rtl" }}>תיאור</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="מצב, גודל, פרטים נוספים…"
            rows={3}
            style={{ ...inputStyle, resize:"none", lineHeight:1.5 }}
          />
        </div>

        {/* Category */}
        <div>
          <label style={{ display:"block", fontWeight:700, fontSize:13, marginBottom:8, direction:"rtl" }}>קטגוריה</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)} style={{
                padding:"7px 14px", borderRadius:999,
                background: category===c ? "var(--ink)" : "var(--surface)",
                color: category===c ? "var(--paper)" : "var(--ink)",
                border:"1.5px solid var(--ink)",
                fontFamily:"var(--font-sans)", fontSize:13, fontWeight:600,
                cursor:"pointer",
              }}>{CAT_EMOJI[c]} {CAT_LABEL[c]}</button>
            ))}
          </div>
        </div>

        {/* Condition */}
        <div>
          <label style={{ display:"block", fontWeight:700, fontSize:13, marginBottom:8, direction:"rtl" }}>מצב</label>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {CONDITIONS.map(c => (
              <button key={c.id} onClick={() => setCondition(c.id)} style={{
                padding:"7px 14px", borderRadius:999,
                background: condition===c.id ? "var(--ink)" : "var(--surface)",
                color: condition===c.id ? "var(--paper)" : "var(--ink)",
                border:"1.5px solid var(--ink)",
                fontFamily:"var(--font-sans)", fontSize:13, fontWeight:600,
                cursor:"pointer",
              }}>{c.label}</button>
            ))}
          </div>
        </div>

        {/* Address */}
        <div>
          <label style={{ display:"block", fontWeight:700, fontSize:13, marginBottom:6, direction:"rtl" }}>כתובת *</label>
          <input
            value={address} onChange={e => setAddress(e.target.value)}
            placeholder="למשל: רחוב הרצל 14, נס ציונה"
            style={inputStyle}
          />
        </div>

        {/* Tags */}
        <div>
          <label style={{ display:"block", fontWeight:700, fontSize:13, marginBottom:6, direction:"rtl" }}>תגיות</label>
          <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
            {tags.map(t => (
              <span key={t} style={{
                display:"inline-flex", alignItems:"center", gap:4,
                padding:"4px 10px", borderRadius:999, fontSize:12, fontWeight:700,
                background:"var(--surface)", border:"1.5px solid var(--ink)",
              }}>
                #{t}
                <button onClick={() => setTags(prev => prev.filter(x => x !== t))} style={{
                  background:"none", border:"none", cursor:"pointer", padding:0,
                  fontSize:14, lineHeight:1, color:"var(--muted)",
                }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <input
              value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="הוסף תגית…"
              style={{ ...inputStyle, flex:1 }}
            />
            <button onClick={addTag} style={{
              padding:"0 16px", borderRadius:12,
              background:"var(--surface)", border:"2px solid var(--ink)",
              fontFamily:"var(--font-sans)", fontWeight:700, fontSize:14,
              cursor:"pointer", boxShadow:"var(--sh-sm)", whiteSpace:"nowrap",
            }}>+ הוסף</button>
          </div>
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
