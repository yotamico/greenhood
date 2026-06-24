"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* ── Categories ── */
const CATS = [
  { id:"furniture",   label:"ריהוט",       emoji:"🪑" },
  { id:"books",       label:"ספרים",       emoji:"📚" },
  { id:"lighting",    label:"תאורה",       emoji:"💡" },
  { id:"electronics", label:"אלקטרוניקה",  emoji:"📺" },
  { id:"kitchen",     label:"מטבח",        emoji:"🍳" },
  { id:"sports",      label:"ספורט",       emoji:"🚲" },
  { id:"plants",      label:"צמחים",       emoji:"🌿" },
  { id:"kids",        label:"ילדים",       emoji:"🧸" },
];

const CONDITIONS = ["שלם","כמעט שלם","פגום אך שמיש","לחלקים","חדש באריזה","משומש מעט"];
const TAGS       = ["וינטג׳","כבד","צריך 2 אנשים","פגום קלות","מתאים לחוץ","פריט נדיר","כשמש"];

export default function ReportPage() {
  const router = useRouter();
  const [loading,   setLoading] = useState(false);
  const [authed,    setAuthed]  = useState(false);
  const [userId,    setUserId]  = useState<string|null>(null);

  /* photo state */
  const [photos,    setPhotos]    = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [captured,  setCaptured]  = useState(false); // true once ≥1 photo exists

  /* AI state */
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiDetected,   setAiDetected]   = useState<string | null>(null); // e.g. "כורסת קטיפה"
  const [aiConfidence, setAiConfidence] = useState<number>(0);
  const [aiFilled,     setAiFilled]     = useState(false); // pill shown after fill
  const aiSuggestionIdRef = useRef<string | null>(null);

  /* form state */
  const [title,     setTitle]     = useState("");
  const [category,  setCategory]  = useState("furniture");
  const [condition, setCondition] = useState("שלם");
  const [tags,      setTags]      = useState<string[]>([]);
  const [address,   setAddress]   = useState("");
  const [lat,       setLat]       = useState<number|null>(null);
  const [lng,       setLng]       = useState<number|null>(null);
  const [pickupDay, setPickupDay] = useState<"tomorrow"|"flexible">("tomorrow");
  const [editingAddress,  setEditingAddress]  = useState(false);
  const [geocoding,       setGeocoding]       = useState(false);
  const [geocodeError,    setGeocodeError]    = useState(false);
  const [suggestions,     setSuggestions]     = useState<{display_name: string; lat: string; lon: string}[]>([]);
  const [suggestOpen,     setSuggestOpen]     = useState(false);
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const multiRef  = useRef<HTMLInputElement>(null);

  /* auth + geolocation */
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

  /* resize + AI analysis */
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

  async function analyzePhoto(file: File) {
    setAiLoading(true);
    setAiDetected(null);
    setAiFilled(false);
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
        setAiDetected(data.title);
        setAiConfidence(data.confidence);
        setTitle(data.title);
        setCategory(data.category);
        setAiFilled(true);
        const { data: row } = await supabase.from("ai_suggestions").insert([{
          suggested_title:    data.title,
          suggested_category: data.category,
        }]).select("id").single();
        if (row) aiSuggestionIdRef.current = row.id;
      }
    } catch { /* best-effort */ }
    finally { setAiLoading(false); }
  }

  function handleSinglePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPhotos(prev => prev.length === 0 ? [f] : [f, ...prev.slice(1)]);
    setPhotoUrls(prev => prev.length === 0 ? [url] : [url, ...prev.slice(1)]);
    setCaptured(true);
    e.target.value = "";
    analyzePhoto(f);
  }

  function handleMultiPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const urls = files.map(f => URL.createObjectURL(f));
    setPhotos(prev => [...prev, ...files].slice(0, 4));
    setPhotoUrls(prev => [...prev, ...urls].slice(0, 4));
    if (files.length > 0) setCaptured(true);
    e.target.value = "";
  }

  function retakePhoto() {
    setCaptured(false);
    setAiDetected(null);
    setAiFilled(false);
    cameraRef.current?.click();
  }

  function toggleTag(t: string) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function onAddressChange(val: string) {
    setAddress(val);
    setGeocodeError(false);
    if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
    if (val.trim().length < 2) { setSuggestions([]); setSuggestOpen(false); return; }
    suggestDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&accept-language=he&countrycodes=il`,
          { headers: { "User-Agent": "eco-navigation/1.0 (https://eco-navigation.vercel.app)" } }
        );
        const data = await res.json();
        setSuggestions(data ?? []);
        setSuggestOpen((data ?? []).length > 0);
      } catch { setSuggestions([]); }
    }, 350);
  }

  function selectSuggestion(s: { display_name: string; lat: string; lon: string }) {
    setLat(parseFloat(s.lat));
    setLng(parseFloat(s.lon));
    setAddress(s.display_name.split(",").slice(0, 2).join(", "));
    setSuggestions([]);
    setSuggestOpen(false);
    setEditingAddress(false);
    setGeocodeError(false);
  }

  async function geocodeAddress() {
    const query = address.trim();
    if (!query) return;
    setGeocoding(true);
    setGeocodeError(false);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=he`,
        { headers: { "User-Agent": "eco-navigation/1.0 (https://eco-navigation.vercel.app)" } }
      );
      const data = await res.json();
      if (data?.[0]) {
        setLat(parseFloat(data[0].lat));
        setLng(parseFloat(data[0].lon));
        setAddress(data[0].display_name.split(",").slice(0, 2).join(", "));
      } else {
        setGeocodeError(true);
      }
    } catch {
      setGeocodeError(true);
    } finally {
      setGeocoding(false);
      setEditingAddress(false);
    }
  }

  /* pickup_day: convert to absolute date string */
  function resolvePickupDate(): string | null {
    if (pickupDay === "flexible") return null;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  async function handleSubmit() {
    if (!userId || !title || !address) return;
    setLoading(true);

    const { data: item, error } = await supabase.from("items").insert([{
      reporter_id: userId,
      title, category, condition, tags, address,
      location: lat && lng ? `POINT(${lng} ${lat})` : null,
      lat: lat ?? null,
      lng: lng ?? null,
      pickup_day: resolvePickupDate(),
      status: "active",
    }]).select().single();

    if (error || !item) { setLoading(false); alert("שגיאה בשמירה"); return; }

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

    if (aiSuggestionIdRef.current) {
      await supabase.from("ai_suggestions").update({
        user_accepted:  aiFilled,
        final_title:    title,
        final_category: category,
        item_id:        item.id,
      }).eq("id", aiSuggestionIdRef.current);
    }

    try {
      await supabase.rpc("increment_xp" as never, { user_id: userId, amount: 50 } as never);
    } catch { /* best-effort */ }

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

  const primaryUrl  = photoUrls[0] ?? null;
  const extraPhotos = photoUrls.slice(1);
  const canPublish  = !!title && !!address && !loading;

  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--paper)",
      fontFamily: "var(--font-sans)",
      display: "flex", flexDirection: "column",
      maxWidth: 480, margin: "0 auto",
    }}>

      {/* ── HEADER ── */}
      <div style={{
        padding: "12px 16px 14px",
        borderBottom: "2px solid var(--ink)",
        background: "var(--paper)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "transparent", border: 0, color: "var(--ink)",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 14, padding: 0,
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
          חזור
        </button>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>
          דיווח חפץ
        </div>
        <div style={{ width: 60 }}/>
      </div>

      {/* ── SINGLE SCROLLING BODY ── */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "18px 20px",
        scrollbarWidth: "none",
      }}>

        {/* ── Photo area ── */}
        <div style={{
          position: "relative",
          aspectRatio: "4 / 3",
          background: captured && primaryUrl ? "var(--paper-2)" : "var(--ink)",
          borderRadius: 16,
          border: "2px solid var(--ink)",
          boxShadow: "4px 4px 0 var(--shadow-ink)",
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 12,
          cursor: captured ? "default" : "pointer",
        }}
          onClick={() => { if (!captured) cameraRef.current?.click(); }}
        >
          {captured && primaryUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={primaryUrl} alt="תמונה ראשית"
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ color: "var(--paper)", textAlign: "center", padding: 40 }}>
              <svg width={52} height={52} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>תצוגת מצלמה</div>
            </div>
          )}

          {/* AI viewfinder corners — shown when captured */}
          {captured && (
            <>
              {[
                { top: 12, right: 12, borderTop: "4px solid var(--primary)", borderRight: "4px solid var(--primary)", borderRadius: "0 12px 0 0" },
                { top: 12, left:  12, borderTop: "4px solid var(--primary)", borderLeft:  "4px solid var(--primary)", borderRadius: "12px 0 0 0" },
                { bottom: 12, right: 12, borderBottom: "4px solid var(--primary)", borderRight: "4px solid var(--primary)", borderRadius: "0 0 12px 0" },
                { bottom: 12, left:  12, borderBottom: "4px solid var(--primary)", borderLeft:  "4px solid var(--primary)", borderRadius: "0 0 0 12px" },
              ].map((s, i) => (
                <div key={i} style={{ position: "absolute", width: 26, height: 26, ...s }}/>
              ))}

              {/* AI badge */}
              <div style={{
                position: "absolute", bottom: 12, left: 12, right: 12,
                padding: "9px 12px",
                background: "var(--surface)", borderRadius: 12,
                border: "2px solid var(--ink)",
                boxShadow: "2.5px 2.5px 0 var(--shadow-ink)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: aiLoading ? "var(--muted)" : "var(--primary)",
                  color: "white", border: "1.5px solid var(--ink)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 12,
                }}>
                  {aiLoading ? "…" : "AI"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>
                    {aiLoading
                      ? "מנתח תמונה…"
                      : aiDetected
                        ? `זוהה: ${aiDetected}`
                        : "מוכן לצילום"
                    }
                  </div>
                  {!aiLoading && aiDetected && (
                    <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                      מילאתי שם, קטגוריה ומצב למטה
                    </div>
                  )}
                </div>
                {!aiLoading && aiDetected && (
                  <span style={{
                    padding: "3px 8px", borderRadius: 999, flexShrink: 0,
                    background: "var(--primary-tint)", color: "var(--primary-dark)",
                    border: "1.5px solid var(--primary-dark)",
                    fontSize: 10, fontWeight: 800,
                  }}>{Math.round(aiConfidence * 100)}%</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Photo action row ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: extraPhotos.length > 0 ? 12 : 22 }}>
          <button
            onClick={retakePhoto}
            style={{
              flex: 1, padding: 11,
              background: "var(--surface)", border: "2px solid var(--ink)",
              borderRadius: 12, boxShadow: "2px 2px 0 var(--shadow-ink)",
              cursor: "pointer", fontFamily: "var(--font-sans)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontSize: 13, fontWeight: 700,
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            {captured ? "צלם שוב" : "צלם"}
          </button>
          {photos.length < 4 && (
            <button
              onClick={() => multiRef.current?.click()}
              style={{
                flex: 1, padding: 11,
                background: "var(--warning-tint)", border: "2px solid var(--ink)",
                borderRadius: 12, boxShadow: "2px 2px 0 var(--shadow-ink)",
                cursor: "pointer", fontFamily: "var(--font-sans)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 13, fontWeight: 700,
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              תמונה נוספת ({photos.length}/4)
            </button>
          )}
        </div>

        {/* extra thumbnails */}
        {extraPhotos.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
            {extraPhotos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt=""
                style={{
                  width: 48, height: 48, objectFit: "cover",
                  borderRadius: 10, border: "1.5px solid var(--ink)", flexShrink: 0,
                }} />
            ))}
          </div>
        )}

        {/* ── AI pill ── */}
        {aiFilled && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 999,
            background: "var(--primary-tint)", color: "var(--primary-dark)",
            border: "1.5px solid var(--primary-dark)",
            fontSize: 11, fontWeight: 800, marginBottom: 14,
          }}>
            ✨ AI מילא בשבילך · תקן אם צריך
          </div>
        )}

        {/* ── Title ── */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
          שם החפץ
        </div>
        <input
          className="gh-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="למשל: ספה תלת מושבית"
          style={{ marginBottom: 20 }}
        />

        {/* ── Category ── */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          קטגוריה
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          {CATS.map(c => {
            const isActive = category === c.id;
            return (
              <button key={c.id} onClick={() => setCategory(c.id)} style={{
                padding: "10px 4px",
                background: isActive ? "var(--primary)" : "var(--surface)",
                border: "2px solid var(--ink)", borderRadius: 12,
                boxShadow: isActive ? "3px 3px 0 var(--shadow-ink)" : "1.5px 1.5px 0 var(--shadow-ink)",
                cursor: "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 4, fontFamily: "var(--font-sans)",
                transition: "all 120ms",
              }}>
                <span style={{ fontSize: 20 }}>{c.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink)" }}>{c.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Condition ── */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          מצב
        </div>
        <div style={{
          display: "flex", gap: 6, marginBottom: 20,
          overflowX: "auto", flexWrap: "nowrap",
          marginLeft: -20, marginRight: -20, padding: "0 20px",
          scrollbarWidth: "none",
        }}>
          {CONDITIONS.map(c => (
            <button key={c} onClick={() => setCondition(c)} style={{
              padding: "7px 14px", height: 34, flexShrink: 0,
              background: condition === c ? "var(--ink)" : "var(--surface)",
              color: condition === c ? "var(--paper)" : "var(--ink)",
              border: "1.5px solid var(--ink)", borderRadius: 999,
              fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13,
              cursor: "pointer", whiteSpace: "nowrap",
              boxShadow: condition === c ? "2px 2px 0 var(--shadow-ink)" : "1px 1px 0 var(--shadow-ink)",
            }}>{c}</button>
          ))}
        </div>

        {/* ── Tags ── */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          תגיות (אופציונלי)
        </div>
        <div style={{
          display: "flex", gap: 6, marginBottom: 22,
          overflowX: "auto", flexWrap: "nowrap",
          marginLeft: -20, marginRight: -20, padding: "0 20px",
          scrollbarWidth: "none",
        }}>
          {TAGS.map(t => (
            <button key={t} onClick={() => toggleTag(t)} style={{
              padding: "7px 14px", height: 34, flexShrink: 0,
              background: tags.includes(t) ? "var(--primary-tint)" : "var(--surface)",
              border: tags.includes(t) ? "2px solid var(--primary-dark)" : "1.5px solid var(--ink)",
              borderRadius: 999,
              fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13,
              cursor: "pointer", whiteSpace: "nowrap", color: "var(--ink)",
              boxShadow: "1px 1px 0 var(--shadow-ink)",
            }}>{t}</button>
          ))}
        </div>

        {/* ── Location ── */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
          מיקום
        </div>
        <div style={{
          background: "var(--surface)", borderRadius: 14,
          border: "2px solid var(--ink)", boxShadow: "3px 3px 0 var(--shadow-ink)",
          padding: 12, marginBottom: 22,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
            stroke="var(--primary-dark)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            {lat && lng && !editingAddress ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{address || "מיקום זוהה"}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                  {geocoding ? "מאתר כתובת…" : "זוהה אוטומטית"}
                </div>
              </>
            ) : (
              <div style={{ position: "relative" }}>
                <input
                  autoFocus={editingAddress}
                  className="gh-input"
                  style={{ boxShadow: "none", border: "none", padding: 0, height: 32 }}
                  value={address}
                  onChange={e => onAddressChange(e.target.value)}
                  onBlur={() => { setTimeout(() => { setSuggestOpen(false); if (!suggestOpen) geocodeAddress(); }, 150); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setSuggestOpen(false); geocodeAddress(); } if (e.key === "Escape") { setSuggestOpen(false); setEditingAddress(false); } }}
                  placeholder="הכנס/י כתובת…"
                  autoComplete="off"
                />
                {suggestOpen && suggestions.length > 0 && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "var(--surface)", border: "2px solid var(--ink)",
                    borderRadius: 12, boxShadow: "4px 4px 0 var(--shadow-ink)",
                    zIndex: 100, overflow: "hidden",
                  }}>
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
                        style={{
                          display: "block", width: "100%", textAlign: "right",
                          padding: "10px 12px",
                          background: "transparent", border: "none",
                          borderBottom: i < suggestions.length - 1 ? "1px solid var(--line)" : "none",
                          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
                          color: "var(--ink)", cursor: "pointer",
                          direction: "rtl",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--paper-2)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>📍 </span>
                        {s.display_name.split(",").slice(0, 2).join(", ")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {geocodeError && (
              <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, marginTop: 2 }}>
                כתובת לא נמצאה — נסה/י שוב
              </div>
            )}
          </div>
          <button
            onClick={() => { setEditingAddress(true); setGeocodeError(false); }}
            style={{
              border: 0, background: "transparent", color: "var(--primary-dark)",
              fontWeight: 700, fontSize: 13, fontFamily: "inherit",
              cursor: geocoding ? "default" : "pointer", padding: 0, flexShrink: 0,
            }}
            disabled={geocoding}
          >
            {geocoding ? "…" : "שנה"}
          </button>
        </div>

        {/* ── Pickup timing ── */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          מתי לאסוף
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          <PickupOption
            id="tomorrow" current={pickupDay} setCurrent={setPickupDay}
            label="פינוי מחר 07:00" sub="יסומן כדחוף לשכנים" hot
          />
          <PickupOption
            id="flexible" current={pickupDay} setCurrent={setPickupDay}
            label="גמיש / זמין כעת" sub="ללא מועד פינוי קבוע"
          />
        </div>

        {/* ── XP hint ── */}
        <div style={{
          padding: 12, background: "var(--primary-tint)", borderRadius: 14,
          border: "2px solid var(--ink)", boxShadow: "3px 3px 0 var(--shadow-ink)",
          display: "flex", gap: 12, alignItems: "center",
          marginBottom: 8,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "var(--primary)", color: "white", border: "2px solid var(--ink)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            fontSize: 20,
          }}>♻️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--primary-dark)" }}>+50 XP</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-soft)" }}>כל דיווח מציל ~8 ק״ג מהטמנה</div>
          </div>
        </div>
      </div>

      {/* ── FOOTER — single publish button ── */}
      <div style={{
        padding: "14px 16px 28px",
        background: "var(--surface)",
        borderTop: "2px solid var(--ink)",
        flexShrink: 0,
      }}>
        <button
          disabled={!canPublish}
          onClick={handleSubmit}
          style={{
            width: "100%", height: 56,
            background: canPublish ? "var(--primary)" : "var(--primary-tint)",
            color: "var(--ink)",
            border: "2px solid var(--ink)", borderRadius: "var(--r-md)",
            fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17,
            cursor: canPublish ? "pointer" : "not-allowed",
            boxShadow: canPublish ? "var(--sh-md)" : "none",
            opacity: canPublish ? 1 : 0.6,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "opacity 200ms, background 200ms",
          }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {loading ? "שומר…" : "פרסם דיווח"}
        </button>
        {!title && (
          <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
            יש למלא שם חפץ לפני הפרסום
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleSinglePhoto}
        style={{ display: "none" }}
      />
      <input
        ref={multiRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleMultiPhotos}
        style={{ display: "none" }}
      />
    </div>
  );
}

/* ── Pickup option radio row ── */
function PickupOption({ id, current, setCurrent, label, sub, hot }: {
  id:         "tomorrow" | "flexible";
  current:    "tomorrow" | "flexible";
  setCurrent: (v: "tomorrow" | "flexible") => void;
  label:      string;
  sub:        string;
  hot?:       boolean;
}) {
  const active = id === current;
  return (
    <button
      onClick={() => setCurrent(id)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: 14, textAlign: "right",
        background: active ? (hot ? "var(--accent-tint)" : "var(--primary-tint)") : "var(--surface)",
        border: "2px solid var(--ink)", borderRadius: 14,
        boxShadow: active ? "3px 3px 0 var(--shadow-ink)" : "1.5px 1.5px 0 var(--shadow-ink)",
        cursor: "pointer", width: "100%", fontFamily: "var(--font-sans)",
        transition: "all 120ms",
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        background: active ? "var(--ink)" : "var(--surface)",
        border: "2px solid var(--ink)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {active && (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
            stroke="var(--paper)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
          {hot && "🔥"}{label}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, marginTop: 2 }}>{sub}</div>
      </div>
    </button>
  );
}
