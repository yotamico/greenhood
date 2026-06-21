"use client";

import { useEffect, useState, useRef } from "react";
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

interface ExistingImage { id: string; url: string; position: number; is_primary: boolean; }

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

  /* image state */
  const [existingImgs,  setExistingImgs]  = useState<ExistingImage[]>([]);
  const [removedIds,    setRemovedIds]    = useState<string[]>([]);
  const [newPhotos,     setNewPhotos]     = useState<File[]>([]);
  const [newPhotoUrls,  setNewPhotoUrls]  = useState<string[]>([]);
  const addPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const [{ data: it }, { data: imgs }] = await Promise.all([
        supabase.from("items").select("*").eq("id", id).single(),
        supabase.from("item_images").select("id,url,position,is_primary").eq("item_id", id).order("position"),
      ]);
      if (!it || it.reporter_id !== session.user.id) { router.replace(`/items/${id}`); return; }

      setTitle(it.title ?? "");
      setDescription(it.description ?? "");
      setCategory(it.category ?? "furniture");
      const condMap: Record<string,string> = { new:"שלם", like_new:"כמעט שלם", good:"פגום אך שמיש", fair:"לחלקים" };
      const storedCond = it.condition ?? "good";
      setCondition(CONDITIONS.includes(storedCond) ? storedCond : (condMap[storedCond] ?? "שלם"));
      setAddress(it.address ?? "");
      setTags(it.tags ?? []);
      setExistingImgs((imgs ?? []) as ExistingImage[]);
      setLoading(false);
    }
    load();
  }, [id, router]);

  function handleAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setNewPhotos(prev => [...prev, ...files]);
    setNewPhotoUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    e.target.value = "";
  }

  function removeExisting(imgId: string) {
    setRemovedIds(prev => [...prev, imgId]);
    setExistingImgs(prev => prev.filter(i => i.id !== imgId));
  }

  function removeNew(idx: number) {
    URL.revokeObjectURL(newPhotoUrls[idx]);
    setNewPhotos(prev => prev.filter((_, i) => i !== idx));
    setNewPhotoUrls(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!title.trim() || !address.trim()) return;
    setSaving(true);

    /* 1. update item fields */
    const hasImageChanges = removedIds.length > 0 || newPhotos.length > 0;
    await supabase.from("items").update({
      title: title.trim(),
      description: description.trim() || null,
      category, condition,
      address: address.trim(),
      tags,
      ...(hasImageChanges ? { moderation_status: "pending", moderation_reason: null } : {}),
    }).eq("id", id);

    /* 2. delete removed images */
    if (removedIds.length) {
      await supabase.from("item_images").delete().in("id", removedIds);
    }

    /* 3. upload new photos */
    const existingCount = existingImgs.length;
    for (let i = 0; i < newPhotos.length; i++) {
      const f    = newPhotos[i];
      const ext  = f.name.split(".").pop() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("report-photos")
        .upload(path, f, { upsert: true });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("report-photos").getPublicUrl(path);
        await supabase.from("item_images").insert([{
          item_id:    id,
          url:        urlData.publicUrl,
          position:   existingCount + i,
          is_primary: existingCount === 0 && i === 0,
        }]);
      }
    }

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

      {/* hidden file input */}
      <input
        ref={addPhotoRef} type="file" accept="image/*" multiple
        style={{ display:"none" }} onChange={handleAddPhotos}
      />

      {/* Form */}
      <div style={{ padding:"20px 16px 120px", display:"flex", flexDirection:"column", gap:20 }}>

        {/* Photos */}
        <div>
          <div style={labelStyle}>תמונות</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-start" }}>
            {/* existing images */}
            {existingImgs.map(img => (
              <div key={img.id} style={{ position:"relative", width:80, height:80, flexShrink:0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" style={{
                  width:80, height:80, objectFit:"cover",
                  borderRadius:12, border:"2px solid var(--ink)",
                }} />
                <button onClick={() => removeExisting(img.id)} style={{
                  position:"absolute", top:-6, right:-6,
                  width:22, height:22, borderRadius:"50%",
                  background:"var(--accent)", color:"white",
                  border:"1.5px solid var(--ink)", cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:13, fontWeight:900, padding:0, lineHeight:1,
                }}>✕</button>
                {img.is_primary && (
                  <div style={{
                    position:"absolute", bottom:4, left:4,
                    fontSize:9, fontWeight:800, color:"white",
                    background:"rgba(45,42,36,0.7)", borderRadius:4, padding:"1px 5px",
                  }}>ראשית</div>
                )}
              </div>
            ))}
            {/* new photos preview */}
            {newPhotoUrls.map((url, idx) => (
              <div key={url} style={{ position:"relative", width:80, height:80, flexShrink:0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{
                  width:80, height:80, objectFit:"cover",
                  borderRadius:12, border:"2px solid var(--primary)",
                }} />
                <button onClick={() => removeNew(idx)} style={{
                  position:"absolute", top:-6, right:-6,
                  width:22, height:22, borderRadius:"50%",
                  background:"var(--accent)", color:"white",
                  border:"1.5px solid var(--ink)", cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:13, fontWeight:900, padding:0, lineHeight:1,
                }}>✕</button>
              </div>
            ))}
            {/* add button */}
            <button onClick={() => addPhotoRef.current?.click()} style={{
              width:80, height:80, borderRadius:12, flexShrink:0,
              background:"var(--surface)", border:"2px dashed var(--ink)",
              display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", gap:4, cursor:"pointer", padding:0,
            }}>
              <span style={{ fontSize:22, lineHeight:1 }}>📷</span>
              <span style={{ fontSize:10, fontWeight:700, color:"var(--muted)" }}>הוסף</span>
            </button>
          </div>
          {removedIds.length > 0 && (
            <div style={{ fontSize:11, color:"var(--accent)", marginTop:6, fontWeight:600 }}>
              {removedIds.length} תמונות יוסרו בשמירה
            </div>
          )}
        </div>

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
