"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* ── Categories ── */
const CATS = [
  { id:"furniture", label:"ריהוט",      emoji:"🪑" },
  { id:"books",     label:"ספרים",      emoji:"📚" },
  { id:"lighting",  label:"תאורה",      emoji:"💡" },
  { id:"electronics",label:"אלקטרוניקה",emoji:"📺" },
  { id:"kitchen",   label:"מטבח",       emoji:"🍳" },
  { id:"sports",    label:"ספורט",      emoji:"⚽" },
  { id:"plants",    label:"צמחים",      emoji:"🌿" },
  { id:"kids",      label:"ילדים",      emoji:"🧸" },
];

const CONDITIONS = ["שלם","כמעט שלם","פגום אך שמיש","לחלקים","לשיפוץ"];
const TAGS       = ["וינטג׳","עץ","צריך 2 אנשים","פרק ורכב","כבד מאוד","פשוט להרים"];

type Step = 1 | 2 | 3;

export default function ReportPage() {
  const router = useRouter();
  const [step,      setStep]    = useState<Step>(1);
  const [loading,   setLoading] = useState(false);
  const [authed,    setAuthed]  = useState(false);
  const [userId,    setUserId]  = useState<string|null>(null);

  /* photo state — array, index 0 is primary */
  const [photos,    setPhotos]    = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  /* AI suggestion state */
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{title:string; category:string} | null>(null);
  const [aiDismissed, setAiDismissed] = useState(false);
  const aiSuggestionIdRef = useRef<string | null>(null); // DB row id for feedback

  /* other form state */
  const [title,     setTitle]     = useState("");
  const [category,  setCategory]  = useState("furniture");
  const [condition, setCondition] = useState("שלם");
  const [tags,      setTags]      = useState<string[]>([]);
  const [address,   setAddress]   = useState("");
  const [lat,       setLat]       = useState<number|null>(null);
  const [lng,       setLng]       = useState<number|null>(null);

  const cameraRef = useRef<HTMLInputElement>(null); // single capture, auto-opened
  const multiRef  = useRef<HTMLInputElement>(null); // multi-file gallery picker

  /* auto-open camera when entering step 1 with no photos */
  useEffect(() => {
    if (authed && step === 1 && photos.length === 0) {
      const t = setTimeout(() => cameraRef.current?.click(), 150);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, step, photos.length]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      setAuthed(true);
      setUserId(session.user.id);
    });
    navigator.geolocation?.getCurrentPosition(pos => {
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
        .then(r => r.json())
        .then(d => setAddress(d.display_name?.split(",").slice(0,2).join(", ") ?? ""))
        .catch(() => {});
    });
  }, [router]);

  /* resize image to max 800px before sending — avoids Vercel 4.5MB body limit (413) */
  async function resizeToBase64(file: File, maxPx = 800): Promise<{ base64: string; mediaType: string }> {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        res({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
      };
      img.onerror = rej;
      img.src = url;
    });
  }

  /* analyze primary photo with Claude Vision */
  async function analyzePhoto(file: File) {
    setAiLoading(true);
    setAiSuggestion(null);
    setAiDismissed(false);
    try {
      const { base64, mediaType } = await resizeToBase64(file);
      const r = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      if (!r.ok) return;
      const data = await r.json() as { title: string; category: string; confidence: number };
      if (data.confidence >= 0.4) {
        setAiSuggestion({ title: data.title, category: data.category });
        /* save suggestion to DB for future learning */
        const { data: row } = await supabase.from("ai_suggestions").insert([{
          suggested_title: data.title,
          suggested_category: data.category,
        }]).select("id").single();
        if (row) aiSuggestionIdRef.current = row.id;
      }
    } catch { /* best-effort */ }
    finally { setAiLoading(false); }
  }

  /* add a single photo (camera) — becomes primary if list is empty */
  function handleSinglePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPhotos(prev => prev.length === 0 ? [f] : [f, ...prev.slice(1)]);
    setPhotoUrls(prev => prev.length === 0 ? [url] : [url, ...prev.slice(1)]);
    e.target.value = "";
    analyzePhoto(f); // fire AI analysis immediately
  }

  /* add multiple photos from gallery (appended after existing) */
  function handleMultiPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const urls = files.map(f => URL.createObjectURL(f));
    setPhotos(prev => [...prev, ...files]);
    setPhotoUrls(prev => [...prev, ...urls]);
    e.target.value = "";
  }

  function handleRemovePhoto(idx: number) {
    setPhotoUrls(prev => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleTag(t: string) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  /* submit — upload all photos then insert item */
  async function handleSubmit() {
    if (!userId || !title || !address) return;
    setLoading(true);

    /* insert item first to get its id */
    const { data: item, error } = await supabase.from("items").insert([{
      reporter_id: userId,
      title, category, condition, tags, address,
      location: lat && lng ? `POINT(${lng} ${lat})` : null,
      lat: lat ?? null,
      lng: lng ?? null,
      status: "active",
    }]).select().single();

    if (error || !item) { setLoading(false); alert("שגיאה בשמירה"); return; }

    /* upload all photos in order */
    for (let i = 0; i < photos.length; i++) {
      const f    = photos[i];
      const ext  = f.name.split(".").pop() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("report-photos")
        .upload(path, f, { upsert: true });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("report-photos").getPublicUrl(path);
        await supabase.from("item_images").insert([{
          item_id:    item.id,
          url:        urlData.publicUrl,
          position:   i,
          is_primary: i === 0,
        }]);
      }
    }

    /* record whether user accepted AI suggestion (for learning) */
    if (aiSuggestionIdRef.current) {
      const accepted = aiSuggestion !== null && !aiDismissed;
      await supabase.from("ai_suggestions").update({
        user_accepted:  accepted,
        final_title:    title,
        final_category: category,
        item_id:        item.id,
      }).eq("id", aiSuggestionIdRef.current);
    }

    /* grant XP */
    try {
      await supabase.rpc("increment_xp" as never, { user_id: userId, amount: 50 } as never);
    } catch { /* best-effort */ }

    /* broadcast push to nearby users */
    fetch("/api/broadcast-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_title:   title,
        item_address: address,
        item_lat:     lat ?? null,
        item_lng:     lng ?? null,
        sender_id:    userId,
      }),
    }).catch(() => {});

    setLoading(false);
    router.replace("/map");
  }

  if (!authed) return null;

  const hasPhotos   = photos.length > 0;
  const step1Locked = step === 1 && !hasPhotos;
  const step2Locked = step === 2 && (!title || !address);

  const ctaLabel =
    step === 1 ? "המשך לפרטים ←" :
    step === 2 ? "סקירה ופרסום ←" :
    loading    ? "שומר…"          : "פרסם עכשיו ✓";

  return (
    <div style={{
      minHeight:"100dvh", background:"var(--paper)",
      fontFamily:"var(--font-sans)",
      display:"flex", flexDirection:"column",
      maxWidth:480, margin:"0 auto",
    }}>

      {/* ── HEADER ── */}
      <div style={{
        padding:"14px 16px 16px",
        borderBottom:"2px solid var(--ink)",
        background:"var(--paper)",
        flexShrink:0,
      }}>
        <div style={{
          display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:14,
        }}>
          <button onClick={() => step > 1 ? setStep((step-1) as Step) : router.back()} style={{
            background:"none", border:"none", cursor:"pointer",
            color:"var(--ink)", fontWeight:700, fontSize:14,
            fontFamily:"var(--font-sans)", padding:0,
            display:"flex", alignItems:"center", gap:4,
          }}>→ חזור</button>
          <span style={{ fontSize:12, fontWeight:600, color:"var(--muted)" }}>שלב {step} / 3</span>
          <button onClick={() => router.back()} style={{
            background:"none", border:"none", cursor:"pointer",
            color:"var(--muted)", fontSize:14, fontFamily:"var(--font-sans)", padding:0,
          }}>שמור טיוטה</button>
        </div>

        <div style={{ display:"flex", gap:6 }}>
          {[1,2,3].map(s => (
            <div key={s} style={{
              flex:1, height:6,
              background: s <= step ? "var(--primary)" : "var(--paper-2)",
              border:"1.5px solid var(--ink)", borderRadius:999,
              transition:"background 200ms",
            }}/>
          ))}
        </div>
        <div style={{
          display:"flex", justifyContent:"space-between",
          marginTop:6, fontSize:10, fontWeight:600,
        }}>
          {["📸 תמונה","📋 פרטים","✅ סקירה"].map((l,i) => (
            <span key={i} style={{ color: i+1===step ? "var(--ink)" : "var(--muted)", fontWeight: i+1===step ? 800 : 500 }}>{l}</span>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 20px" }}>
        {step === 1 && (
          <>
            <StepCamera
              photoUrls={photoUrls}
              cameraRef={cameraRef}
              multiRef={multiRef}
              onSingleFile={handleSinglePhoto}
              onMultiFiles={handleMultiPhotos}
              onRemove={handleRemovePhoto}
            />
            {aiLoading && (
              <div style={{
                marginTop:12, padding:"10px 14px",
                background:"#EEF7EE", border:"1.5px solid #6B9956",
                borderRadius:12, display:"flex", alignItems:"center", gap:8,
                fontSize:13, fontWeight:600, color:"#4A7A3A",
              }}>
                <span style={{ fontSize:18 }}>🤖</span>
                מנתח את התמונה…
              </div>
            )}
            {aiSuggestion && !aiLoading && !aiDismissed && (
              <div style={{
                marginTop:12, padding:"10px 14px",
                background:"#EEF7EE", border:"1.5px solid #6B9956",
                borderRadius:12, display:"flex", alignItems:"center", gap:8,
                fontSize:13, fontWeight:600, color:"#4A7A3A",
              }}>
                <span style={{ fontSize:18 }}>✅</span>
                זיהינו: <strong>{aiSuggestion.title}</strong>
              </div>
            )}
          </>
        )}
        {step === 2 && (
          <>
            {/* AI suggestion banner */}
            {aiSuggestion && !aiDismissed && (
              <div style={{
                marginBottom:16, padding:"12px 14px",
                background:"#EEF7EE", border:"2px solid #6B9956",
                borderRadius:14, boxShadow:"var(--sh-sm)",
                display:"flex", alignItems:"center", gap:10,
              }}>
                <span style={{ fontSize:22, flexShrink:0 }}>🤖</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#4A7A3A", marginBottom:4 }}>
                    זיהינו אוטומטית:
                  </div>
                  <div style={{ fontSize:14, fontWeight:800, color:"var(--ink)" }}>
                    {aiSuggestion.title}
                  </div>
                  <div style={{ fontSize:11, color:"var(--muted)", fontWeight:500 }}>
                    קטגוריה: {CATS.find(c => c.id === aiSuggestion.category)?.label ?? aiSuggestion.category}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                  <button
                    onClick={() => { setTitle(aiSuggestion.title); setCategory(aiSuggestion.category); setAiDismissed(true); }}
                    style={{
                      padding:"5px 12px", borderRadius:999,
                      background:"var(--primary)", border:"1.5px solid var(--ink)",
                      fontFamily:"var(--font-sans)", fontWeight:700, fontSize:12,
                      cursor:"pointer",
                    }}
                  >אשר ✓</button>
                  <button
                    onClick={() => setAiDismissed(true)}
                    style={{
                      padding:"5px 12px", borderRadius:999,
                      background:"none", border:"1.5px solid var(--ink)",
                      fontFamily:"var(--font-sans)", fontWeight:700, fontSize:12,
                      cursor:"pointer", color:"var(--muted)",
                    }}
                  >שנה</button>
                </div>
              </div>
            )}
            {aiLoading && (
              <div style={{
                marginBottom:16, padding:"10px 14px",
                background:"var(--paper-2)", border:"1.5px solid var(--ink)",
                borderRadius:12, display:"flex", alignItems:"center", gap:8,
                fontSize:13, fontWeight:600, color:"var(--muted)",
              }}>
                <span style={{ fontSize:18 }}>🔍</span> מנתח תמונה…
              </div>
            )}
            <StepDetails
              title={title} setTitle={setTitle}
              category={category} setCategory={setCategory}
              condition={condition} setCondition={setCondition}
              tags={tags} toggleTag={toggleTag}
              address={address} setAddress={setAddress}
              lat={lat} lng={lng}
            />
          </>
        )}
        {step === 3 && (
          <StepReview
            primaryPhotoUrl={photoUrls[0] ?? null}
            photoCount={photos.length}
            title={title}
            category={CATS.find(c => c.id === category)!}
            condition={condition} tags={tags} address={address}
          />
        )}
      </div>

      {/* ── CTA ── */}
      <div style={{
        padding:"14px 16px 32px",
        background:"var(--surface)",
        borderTop:"2px solid var(--ink)",
        flexShrink:0,
      }}>
        <div style={{ display:"flex", gap:10, alignItems:"stretch" }}>
          {/* Secondary "add photos" button — only on step 1 */}
          {step === 1 && (
            <button
              onClick={() => multiRef.current?.click()}
              style={{
                flexShrink:0,
                padding:"0 18px",
                height:56,
                background:"var(--surface)",
                border:"2px solid var(--ink)",
                borderRadius:"var(--r-md)",
                fontFamily:"var(--font-sans)", fontWeight:700, fontSize:14,
                cursor:"pointer",
                boxShadow:"var(--sh-sm)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                color:"var(--ink)",
              }}
            >
              <span style={{ fontSize:18, lineHeight:1 }}>+</span>
              <span>הוסף</span>
            </button>
          )}

          {/* Main CTA */}
          <button
            disabled={loading || step1Locked || step2Locked}
            onClick={() => step < 3 ? setStep((step+1) as Step) : handleSubmit()}
            style={{
              flex:1, height:56,
              background: (step1Locked || loading) ? "var(--primary-tint)" : "var(--primary)",
              color:"var(--ink)",
              border:"2px solid var(--ink)", borderRadius:"var(--r-md)",
              fontFamily:"var(--font-sans)", fontWeight:700, fontSize:17,
              cursor: (loading || step1Locked || step2Locked) ? "not-allowed" : "pointer",
              boxShadow:"var(--sh-md)",
              opacity: (step1Locked || step2Locked) ? 0.55 : 1,
              transition:"opacity 200ms, background 200ms",
            }}
          >{ctaLabel}</button>
        </div>

        {/* Hint when button is locked on step 1 */}
        {step1Locked && (
          <div style={{
            marginTop:8, textAlign:"center",
            fontSize:12, color:"var(--muted)", fontWeight:500,
          }}>יש להוסיף לפחות תמונה אחת כדי להמשיך</div>
        )}
      </div>
    </div>
  );
}

/* ── Step 1: Camera ── */
function StepCamera({ photoUrls, cameraRef, multiRef, onSingleFile, onMultiFiles, onRemove }: {
  photoUrls:     string[];
  cameraRef:     React.RefObject<HTMLInputElement | null>;
  multiRef:      React.RefObject<HTMLInputElement | null>;
  onSingleFile:  (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMultiFiles:  (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove:      (idx: number) => void;
}) {
  const primaryUrl = photoUrls[0] ?? null;
  const extras     = photoUrls.slice(1);

  return (
    <div>
      <h2 style={{
        fontFamily:"var(--font-display)", fontWeight:900,
        fontSize:26, margin:"0 0 8px", lineHeight:1.1,
      }}>צלם/י את הפריט</h2>
      <p style={{ fontSize:14, color:"var(--muted)", fontWeight:500, margin:"0 0 20px" }}>
        תמונה ברורה עוזרת למצוא את הפריט מהר יותר.
      </p>

      {/* ── Primary photo area ── */}
      <div
        onClick={() => !primaryUrl && cameraRef.current?.click()}
        style={{
          position:"relative",
          aspectRatio:"4/5",
          background: primaryUrl ? "transparent" : "var(--paper-2)",
          borderRadius:16,
          border:`2px ${primaryUrl ? "solid" : "dashed"} var(--ink)`,
          boxShadow:"var(--sh-lg)",
          overflow:"hidden",
          display:"flex", alignItems:"center", justifyContent:"center",
          cursor: primaryUrl ? "default" : "pointer",
          marginBottom: extras.length > 0 ? 0 : 14,
        }}
      >
        {primaryUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={primaryUrl} alt="תצוגה" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>

            {/* Remove primary button — top-left */}
            <button
              onClick={e => { e.stopPropagation(); onRemove(0); }}
              style={{
                position:"absolute", top:10, left:10,
                width:36, height:36, borderRadius:"50%",
                background:"var(--surface)", border:"2px solid var(--ink)",
                display:"flex", alignItems:"center", justifyContent:"center",
                cursor:"pointer", fontSize:16, padding:0,
                boxShadow:"var(--sh-sm)",
              }}
            >✕</button>

            {/* "ראשית" badge — bottom-right */}
            <div style={{
              position:"absolute", bottom:10, right:10,
              padding:"3px 10px", borderRadius:999,
              background:"var(--ink)", color:"var(--paper)",
              fontSize:11, fontWeight:700,
            }}>ראשית</div>
          </>
        ) : (
          <div style={{ textAlign:"center", padding:40 }}>
            <div style={{ fontSize:56, marginBottom:12 }}>📷</div>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>לחץ/י לצילום</div>
            <div style={{ fontSize:12, color:"var(--muted)", fontWeight:500 }}>
              גלריה · מצלמה
            </div>
          </div>
        )}
      </div>

      {/* ── Extra thumbnails — below main image ── */}
      {extras.length > 0 && (
        <div style={{
          display:"flex", gap:8, overflowX:"auto",
          paddingTop:12, paddingBottom:4, marginBottom:14,
          scrollbarWidth:"none",
        }}>
          {extras.map((url, i) => (
            <div key={i} style={{ position:"relative", flexShrink:0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url} alt=""
                style={{ width:72, height:72, objectFit:"cover", borderRadius:10, border:"2px solid var(--ink)", display:"block" }}
              />
              <button
                onClick={() => onRemove(i + 1)}
                style={{
                  position:"absolute", top:5, left:5,
                  width:22, height:22, borderRadius:"50%",
                  background:"rgba(45,42,36,0.85)", color:"white",
                  border:"2px solid white",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  cursor:"pointer", fontSize:11, padding:0, fontWeight:800,
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onSingleFile}
        style={{ display:"none" }}
      />
      <input
        ref={multiRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onMultiFiles}
        style={{ display:"none" }}
      />
    </div>
  );
}

/* ── Step 2: Details ── */
function StepDetails({ title, setTitle, category, setCategory, condition,
  setCondition, tags, toggleTag, address, setAddress, lat, lng }: {
  title:string; setTitle:(v:string)=>void;
  category:string; setCategory:(v:string)=>void;
  condition:string; setCondition:(v:string)=>void;
  tags:string[]; toggleTag:(t:string)=>void;
  address:string; setAddress:(v:string)=>void;
  lat:number|null; lng:number|null;
}) {
  return (
    <div>
      <h2 style={{
        fontFamily:"var(--font-display)", fontWeight:900,
        fontSize:26, margin:"0 0 8px", lineHeight:1.1,
      }}>פרטי הפריט</h2>
      <p style={{ fontSize:14, color:"var(--muted)", fontWeight:500, margin:"0 0 20px" }}>
        מלא/י את הפרטים — כמה שיותר, כך יותר קל למצוא.
      </p>

      <label style={{ display:"block", marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>שם הפריט *</div>
        <input
          className="gh-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="למשל: ספה תלת מושבית"
          required
        />
      </label>

      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>קטגוריה</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {CATS.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{
              padding:"10px 4px",
              background: category===c.id ? "var(--primary)" : "var(--surface)",
              border:"2px solid var(--ink)", borderRadius:12,
              boxShadow: category===c.id ? "var(--sh-md)" : "var(--sh-sm)",
              cursor:"pointer",
              display:"flex", flexDirection:"column",
              alignItems:"center", gap:4,
              fontFamily:"var(--font-sans)",
              transition:"all 120ms",
            }}>
              <span style={{ fontSize:20 }}>{c.emoji}</span>
              <span style={{ fontSize:10, fontWeight:700 }}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>מצב</div>
        <div style={{ display:"flex", gap:6, overflowX:"auto", marginInline:-20, paddingInline:20, scrollbarWidth:"none" }}>
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

      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>תגיות (לא חובה)</div>
        <div style={{ display:"flex", gap:6, overflowX:"auto", marginInline:-20, paddingInline:20, scrollbarWidth:"none" }}>
          {TAGS.map(t => (
            <button key={t} onClick={() => toggleTag(t)} style={{
              padding:"7px 14px", height:34, flexShrink:0,
              background: tags.includes(t) ? "var(--primary-tint)" : "var(--surface)",
              border: tags.includes(t) ? "2px solid var(--primary-dark)" : "1.5px solid var(--ink)",
              borderRadius:999,
              fontFamily:"var(--font-sans)", fontWeight:700, fontSize:13,
              cursor:"pointer", whiteSpace:"nowrap", color:"var(--ink)",
              boxShadow:"1px 1px 0 var(--shadow-ink)",
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>כתובת *</div>
        <div style={{
          background:"var(--surface)", borderRadius:"var(--r-md)",
          border:"2px solid var(--ink)", boxShadow:"var(--sh-md)",
          padding:12,
          display:"flex", alignItems:"center", gap:10,
        }}>
          <span style={{ fontSize:18 }}>📍</span>
          <div style={{ flex:1 }}>
            {lat && lng ? (
              <div style={{ fontSize:13, fontWeight:700, color:"var(--ink)" }}>{address || "מיקום זוהה"}</div>
            ) : (
              <input
                className="gh-input"
                style={{ boxShadow:"none", border:"none", padding:"0", height:32 }}
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="הכנס/י כתובת ידנית…"
              />
            )}
            <div style={{ fontSize:11, color:"var(--muted)", fontWeight:500, marginTop:2 }}>
              {lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "לא זוהה GPS"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Step 3: Review ── */
function StepReview({ primaryPhotoUrl, photoCount, title, category, condition, tags, address }: {
  primaryPhotoUrl: string|null;
  photoCount:      number;
  title:           string;
  category:        { id:string; label:string; emoji:string };
  condition:       string;
  tags:            string[];
  address:         string;
}) {
  return (
    <div>
      <h2 style={{
        fontFamily:"var(--font-display)", fontWeight:900,
        fontSize:26, margin:"0 0 8px", lineHeight:1.1,
      }}>הכל נראה טוב?</h2>
      <p style={{ fontSize:14, color:"var(--muted)", fontWeight:500, margin:"0 0 20px" }}>
        זו התצוגה שיראו שאר המשתמשים.
      </p>

      <div style={{
        background:"var(--surface)",
        border:"2px solid var(--ink)", borderRadius:16,
        boxShadow:"var(--sh-lg)",
        overflow:"hidden", marginBottom:16,
      }}>
        <div style={{
          height:180,
          background: primaryPhotoUrl ? "transparent" : "var(--warning-tint)",
          borderBottom:"2px solid var(--ink)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:80, position:"relative", overflow:"hidden",
        }}>
          {primaryPhotoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={primaryPhotoUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
            : category.emoji
          }
          {photoCount > 1 && (
            <div style={{
              position:"absolute", bottom:10, right:10,
              padding:"3px 10px", borderRadius:999,
              background:"rgba(45,42,36,0.75)", color:"var(--paper)",
              fontSize:12, fontWeight:700,
            }}>+{photoCount - 1} תמונות</div>
          )}
        </div>
        <div style={{ padding:14 }}>
          <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:18, marginBottom:4 }}>{title}</div>
          <div style={{ fontSize:12, color:"var(--muted)", fontWeight:500, marginBottom:8 }}>📍 {address}</div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {[category.label, condition, ...tags].map(t => (
              <span key={t} style={{
                padding:"2px 8px", borderRadius:999,
                background:"var(--paper-2)", border:"1.5px solid var(--ink)",
                fontSize:11, fontWeight:700,
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        padding:14,
        background:"var(--primary-tint)", borderRadius:14,
        border:"2px solid var(--ink)", boxShadow:"var(--sh-md)",
        display:"flex", gap:12, alignItems:"center",
      }}>
        <div style={{
          width:40, height:40, borderRadius:10,
          background:"var(--primary)", border:"2px solid var(--ink)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:20, flexShrink:0,
        }}>♻️</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:800, color:"var(--primary-dark)" }}>+50 XP על הפרסום</div>
          <div style={{ fontSize:12, fontWeight:500, color:"var(--ink-soft)" }}>
            ותציל בערך 8 ק&quot;ג מהטמנה 🌱
          </div>
        </div>
      </div>
    </div>
  );
}
