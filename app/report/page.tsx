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
  const [step,      setStep]      = useState<Step>(1);
  const [loading,   setLoading]   = useState(false);
  const [authed,    setAuthed]    = useState(false);
  const [userId,    setUserId]    = useState<string|null>(null);

  /* form state */
  const [photo,     setPhoto]     = useState<File | null>(null);
  const [photoUrl,  setPhotoUrl]  = useState<string|null>(null);
  const [title,     setTitle]     = useState("");
  const [category,  setCategory]  = useState("furniture");
  const [condition, setCondition] = useState("שלם");
  const [tags,      setTags]      = useState<string[]>([]);
  const [address,   setAddress]   = useState("");
  const [lat,       setLat]       = useState<number|null>(null);
  const [lng,       setLng]       = useState<number|null>(null);
  const fileRef    = useRef<HTMLInputElement>(null); // gallery
  const cameraRef  = useRef<HTMLInputElement>(null); // camera (auto-open)

  /* auto-open camera when page is ready */
  useEffect(() => {
    if (authed && step === 1 && !photo) {
      const t = setTimeout(() => cameraRef.current?.click(), 150);
      return () => clearTimeout(t);
    }
  }, [authed, step, photo]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      setAuthed(true);
      setUserId(session.user.id);
    });
    /* auto-detect location */
    navigator.geolocation?.getCurrentPosition(pos => {
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
      /* reverse-geocode via nominatim */
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
        .then(r => r.json())
        .then(d => setAddress(d.display_name?.split(",").slice(0,2).join(", ") ?? ""))
        .catch(() => {});
    });
  }, [router]);

  /* photo preview */
  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPhotoUrl(URL.createObjectURL(f));
  }

  function toggleTag(t: string) {
    setTags(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev, t]);
  }

  /* submit */
  async function handleSubmit() {
    if (!userId || !title || !address) return;
    setLoading(true);

    let mainPhotoUrl: string | null = null;

    /* upload photo if present */
    if (photo) {
      const ext  = photo.name.split(".").pop() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("report-photos")
        .upload(path, photo, { upsert: true });
      if (!upErr) {
        const { data } = supabase.storage.from("report-photos").getPublicUrl(path);
        mainPhotoUrl = data.publicUrl;
      }
    }

    /* insert item */
    const { data: item, error } = await supabase.from("items").insert([{
      reporter_id: userId,
      title,
      category,
      condition,
      tags,
      address,
      location: lat && lng ? `POINT(${lng} ${lat})` : null,
      lat:      lat ?? null,
      lng:      lng ?? null,
      status: "active",
    }]).select().single();

    if (error || !item) { setLoading(false); alert("שגיאה בשמירה"); return; }

    /* insert image row if we have a photo */
    if (mainPhotoUrl) {
      await supabase.from("item_images").insert([{
        item_id: item.id, url: mainPhotoUrl, position: 0, is_primary: true,
      }]);
    }

    /* grant XP */
    try {
      await supabase.rpc("increment_xp" as never, { user_id: userId, amount: 50 } as never);
    } catch { /* best-effort */ }

    setLoading(false);
    router.replace("/map");
  }

  if (!authed) return null;

  const ctaLabel =
    step === 1 ? "המשך לפרטים ←" :
    step === 2 ? "סקירה ופרסום ←" :
    loading   ? "שומר…"          : "פרסם עכשיו ✓";

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

        {/* progress bar */}
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
          <StepCamera
            photoUrl={photoUrl}
            fileRef={fileRef}
            cameraRef={cameraRef}
            onFile={handlePhoto}
            onClear={() => { setPhoto(null); setPhotoUrl(null); }}
          />
        )}
        {step === 2 && (
          <StepDetails
            title={title} setTitle={setTitle}
            category={category} setCategory={setCategory}
            condition={condition} setCondition={setCondition}
            tags={tags} toggleTag={toggleTag}
            address={address} setAddress={setAddress}
            lat={lat} lng={lng}
          />
        )}
        {step === 3 && (
          <StepReview
            photoUrl={photoUrl} title={title}
            category={CATS.find(c=>c.id===category)!}
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
        <button
          disabled={loading || (step===2 && (!title || !address))}
          onClick={() => step < 3 ? setStep((step+1) as Step) : handleSubmit()}
          style={{
            width:"100%", height:56,
            background: loading ? "var(--primary-tint)" : "var(--primary)",
            color:"var(--ink)",
            border:"2px solid var(--ink)", borderRadius:"var(--r-md)",
            fontFamily:"var(--font-sans)", fontWeight:700, fontSize:17,
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow:"var(--sh-md)",
            opacity: (step===2 && (!title||!address)) ? 0.6 : 1,
          }}
        >{ctaLabel}</button>
      </div>
    </div>
  );
}

/* ── Step 1: Camera ── */
function StepCamera({ photoUrl, fileRef, cameraRef, onFile, onClear }: {
  photoUrl:string|null;
  fileRef:React.RefObject<HTMLInputElement | null>;
  cameraRef:React.RefObject<HTMLInputElement | null>;
  onFile:(e:React.ChangeEvent<HTMLInputElement>)=>void;
  onClear:()=>void;
}) {
  return (
    <div>
      <h2 style={{
        fontFamily:"var(--font-display)", fontWeight:900,
        fontSize:26, margin:"0 0 8px", lineHeight:1.1,
      }}>צלם/י את הפריט</h2>
      <p style={{fontSize:14,color:"var(--muted)",fontWeight:500,margin:"0 0 20px"}}>
        תמונה ברורה עוזרת למצוא את הפריט מהר יותר. לא חובה.
      </p>

      {/* preview / upload area */}
      <div
        onClick={() => !photoUrl && cameraRef.current?.click()}
        style={{
          position:"relative",
          aspectRatio:"4/5",
          background: photoUrl ? "transparent" : "var(--paper-2)",
          borderRadius:16,
          border:`2px ${photoUrl ? "solid" : "dashed"} var(--ink)`,
          boxShadow:"var(--sh-lg)",
          overflow:"hidden",
          display:"flex", alignItems:"center", justifyContent:"center",
          cursor: photoUrl ? "default" : "pointer",
          marginBottom:14,
        }}
      >
        {photoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="תצוגה" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
            <button
              onClick={onClear}
              style={{
                position:"absolute", top:10, left:10,
                width:36, height:36, borderRadius:"50%",
                background:"var(--surface)", border:"2px solid var(--ink)",
                display:"flex", alignItems:"center", justifyContent:"center",
                cursor:"pointer", fontSize:16, padding:0,
                boxShadow:"var(--sh-sm)",
              }}
            >✕</button>
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

      {/* Gallery picker — triggered by the button */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        style={{ display:"none" }}
      />
      {/* Camera — auto-opened on page load */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display:"none" }}
      />

      {!photoUrl && (
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width:"100%", height:48,
            background:"var(--surface)",
            border:"2px solid var(--ink)", borderRadius:"var(--r-md)",
            boxShadow:"var(--sh-md)",
            fontFamily:"var(--font-sans)", fontWeight:700, fontSize:14,
            cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          }}
        >
          <span style={{fontSize:18}}>📷</span> בחר/י תמונה
        </button>
      )}
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
      <p style={{fontSize:14,color:"var(--muted)",fontWeight:500,margin:"0 0 20px"}}>
        מלא/י את הפרטים — כמה שיותר, כך יותר קל למצוא.
      </p>

      {/* Title */}
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

      {/* Category */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>קטגוריה</div>
        <div style={{
          display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8,
        }}>
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
              <span style={{fontSize:20}}>{c.emoji}</span>
              <span style={{fontSize:10,fontWeight:700}}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Condition */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>מצב</div>
        <div style={{
          display:"flex", gap:6, overflowX:"auto",
          marginInline:-20, paddingInline:20,
          scrollbarWidth:"none",
        }}>
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

      {/* Tags */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>תגיות (לא חובה)</div>
        <div style={{
          display:"flex", gap:6, overflowX:"auto",
          marginInline:-20, paddingInline:20,
          scrollbarWidth:"none",
        }}>
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

      {/* Location */}
      <div style={{ marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>כתובת *</div>
        <div style={{
          background:"var(--surface)", borderRadius:"var(--r-md)",
          border:"2px solid var(--ink)", boxShadow:"var(--sh-md)",
          padding:12,
          display:"flex", alignItems:"center", gap:10,
        }}>
          <span style={{fontSize:18}}>📍</span>
          <div style={{flex:1}}>
            {lat && lng ? (
              <div style={{fontSize:13,fontWeight:700,color:"var(--ink)"}}>{address || "מיקום זוהה"}</div>
            ) : (
              <input
                className="gh-input"
                style={{boxShadow:"none",border:"none",padding:"0",height:32}}
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="הכנס/י כתובת ידנית…"
              />
            )}
            <div style={{fontSize:11,color:"var(--muted)",fontWeight:500,marginTop:2}}>
              {lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "לא זוהה GPS"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Step 3: Review ── */
function StepReview({ photoUrl, title, category, condition, tags, address }: {
  photoUrl:string|null;
  title:string;
  category:{ id:string; label:string; emoji:string };
  condition:string;
  tags:string[];
  address:string;
}) {
  return (
    <div>
      <h2 style={{
        fontFamily:"var(--font-display)", fontWeight:900,
        fontSize:26, margin:"0 0 8px", lineHeight:1.1,
      }}>הכל נראה טוב?</h2>
      <p style={{fontSize:14,color:"var(--muted)",fontWeight:500,margin:"0 0 20px"}}>
        זו התצוגה שיראו שאר המשתמשים.
      </p>

      {/* preview card */}
      <div style={{
        background:"var(--surface)",
        border:"2px solid var(--ink)", borderRadius:16,
        boxShadow:"var(--sh-lg)",
        overflow:"hidden", marginBottom:16,
      }}>
        {/* image */}
        <div style={{
          height:180,
          background: photoUrl ? "transparent" : "var(--warning-tint)",
          borderBottom:"2px solid var(--ink)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:80, position:"relative",
          overflow:"hidden",
        }}>
          {photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            : category.emoji
          }
        </div>
        <div style={{padding:14}}>
          <div style={{
            fontFamily:"var(--font-display)", fontWeight:900,
            fontSize:18, marginBottom:4,
          }}>{title}</div>
          <div style={{fontSize:12,color:"var(--muted)",fontWeight:500,marginBottom:8}}>
            📍 {address}
          </div>
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

      {/* XP badge */}
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
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:"var(--primary-dark)"}}>+50 XP על הפרסום</div>
          <div style={{fontSize:12,fontWeight:500,color:"var(--ink-soft)"}}>
            ותציל בערך 8 ק"ג מהטמנה 🌱
          </div>
        </div>
      </div>
    </div>
  );
}
