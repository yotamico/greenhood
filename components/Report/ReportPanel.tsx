"use client";

import { useState, useEffect, useRef } from "react";
import { NES_ZIONA_STREETS, Street } from "@/lib/nes-ziona-streets";
import { insertReport } from "@/lib/supabase";

type LatLng = [number, number];

interface Props {
  userPos: LatLng | null;
  onClose: () => void;
  onSubmitted: () => void;
}

const CONDITIONS = ["טוב", "בינוני", "ישן / שבור"];
const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function hoursUntilDay(hebrewDay: string): number {
  const target = HEBREW_DAYS.indexOf(hebrewDay);
  if (target === -1) return -1;
  const now = new Date();
  let daysAway = target - now.getDay();
  if (daysAway <= 0) daysAway += 7;
  return Math.round(daysAway * 24 - now.getHours());
}

function labelUntilDay(hebrewDay: string): string {
  const target = HEBREW_DAYS.indexOf(hebrewDay);
  if (target === -1) return "";
  const now = new Date();
  let daysAway = target - now.getDay();
  if (daysAway <= 0) daysAway += 7;
  if (daysAway === 1) return "(מחר)";
  if (daysAway === 0) return "(היום!)";
  return `(בעוד ${daysAway} ימים)`;
}

function nowHHMM(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
}

function findNearest(pos: LatLng): Street | null {
  const streets = NES_ZIONA_STREETS.filter(s => s.lat != null && s.lng != null);
  if (!streets.length) return null;
  return streets.reduce((best, s) => {
    const d  = (s.lat!    - pos[0]) ** 2 + (s.lng!    - pos[1]) ** 2;
    const bd = (best.lat! - pos[0]) ** 2 + (best.lng! - pos[1]) ** 2;
    return d < bd ? s : best;
  });
}

async function reverseGeocode(pos: LatLng): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`/api/geocode?lat=${pos[0]}&lng=${pos[1]}`, { signal: ctrl.signal });
    clearTimeout(t);
    const data = await res.json();
    const road = data.address?.road ?? data.address?.pedestrian ?? data.address?.suburb ?? "";
    const city = data.address?.city ?? data.address?.town ?? data.address?.municipality ?? "";
    return road ? `${road}${city ? ", " + city : ""}` : city || "";
  } catch {
    return "";
  }
}

function matchStreet(road: string): Street | null {
  if (!road) return null;
  return NES_ZIONA_STREETS.find(s =>
    s.name === road || s.name.includes(road) || road.includes(s.name)
  ) ?? null;
}

// מחזיר רחוב רק אם המרחק ≤ 3 ק"מ
function findNearestInRange(pos: LatLng): Street | null {
  const streets = NES_ZIONA_STREETS.filter(s => s.lat != null && s.lng != null);
  if (!streets.length) return null;
  const best = streets.reduce((b, s) =>
    ((s.lat! - pos[0]) ** 2 + (s.lng! - pos[1]) ** 2) <
    ((b.lat! - pos[0]) ** 2 + (b.lng! - pos[1]) ** 2) ? s : b
  );
  const dist = Math.sqrt((best.lat! - pos[0]) ** 2 + (best.lng! - pos[1]) ** 2);
  return dist < 0.01 ? best : null; // ~1 ק"מ
}

export function ReportPanel({ userPos, onClose, onSubmitted }: Props) {
  const [street,      setStreet]      = useState<Street | null>(null);
  const [displayAddr, setDisplayAddr] = useState<string>("");
  const [searching,   setSearching]   = useState(false);
  const [searchQ,     setSearchQ]     = useState("");
  const [itemType,    setItemType]    = useState("");
  const [description, setDescription] = useState("");
  const [condition,   setCondition]   = useState("");
  const [notes,       setNotes]       = useState("");
  const [locating,    setLocating]    = useState(false);
  const [isTaken,     setIsTaken]     = useState(false);
  const [photoFile,   setPhotoFile]   = useState<File | null>(null);
  const [photoPreview,setPhotoPreview]= useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [success,     setSuccess]     = useState(false);
  const [err,         setErr]         = useState<string | null>(null);
  const [reportTime]                  = useState(() => nowHHMM());
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function detectFromPos(pos: LatLng) {
    const road = await reverseGeocode(pos);
    if (road) {
      setDisplayAddr(road);
      setStreet(matchStreet(road) ?? findNearestInRange(pos));
    } else {
      const nearest = findNearestInRange(pos);
      setStreet(nearest);
      setDisplayAddr(nearest?.name ?? "");
    }
    setLocating(false);
  }

  useEffect(() => {
    setLocating(true);
    if (userPos) {
      // יש כבר מיקום מהמפה — השתמש בו ישירות
      detectFromPos(userPos);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => detectFromPos([coords.latitude, coords.longitude]),
        () => setLocating(false),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
      );
    } else {
      setLocating(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const searchResults = searchQ.length >= 2
    ? NES_ZIONA_STREETS.filter(s => s.name.includes(searchQ)).slice(0, 6)
    : [];

  async function handleSubmit() {
    if (!street)   { setErr("יש לאתר כתובת"); return; }
    if (!itemType.trim()) { setErr("יש לציין סוג חפץ"); return; }
    setSubmitting(true);
    setErr(null);
    const { error } = await insertReport({
      street_name:      displayAddr || street.name,
      item_type:        itemType.trim(),
      item_description: description.trim() || null,
      item_condition:   condition || null,
      notes:            notes.trim() || null,
      is_taken:         isTaken,
      lat:              userPos?.[0] ?? street.lat,
      lng:              userPos?.[1] ?? street.lng,
      takeout_day:      street.takeout_day,
      collection_day:   street.collection_day,
    });
    setSubmitting(false);
    if (error) { setErr("שגיאה בשליחה — נסה שוב"); return; }
    setSuccess(true);
    setTimeout(() => { onSubmitted(); onClose(); }, 2200);
  }

  if (success) {
    return (
      <div style={s.root}>
        <div style={s.successBox}>
          <div style={{ fontSize: 56 }}>✅</div>
          <p style={{ fontSize: 20, fontWeight: 800, color: "#38e07b", marginTop: 14 }}>הדיווח נשלח!</p>
          <p style={{ color: "#7880a0", marginTop: 6, fontSize: 14 }}>תודה שעוזר לשכנים 🙏</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root} dir="rtl">

      {/* כותרת */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={onClose} aria-label="חזור">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h2 style={s.title}>דווח על חפץ לפינוי</h2>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.scroll}>

        {/* כרטיס מיקום */}
        <div style={s.locationCard}>
          <div style={s.mapBg}>
            {/* grid lines לאפקט מפה */}
            <svg style={{ position: "absolute", inset: 0, opacity: 0.12 }} width="100%" height="100%">
              <defs>
                <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#fff" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
            {/* קו אופקי וקו אנכי */}
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.15)" }} />
            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.15)" }} />
            {/* סמן מיקום */}
            <div style={s.pinWrapper}>
              <div style={s.pinBubble}>
                <p style={s.pinTitle}>המיקום כאן</p>
                <p style={s.pinAddr}>{locating ? "מאתר מיקום..." : (displayAddr || street?.name || "לא זוהה")}</p>
                <p style={s.pinCity}>Nes Ziona</p>
              </div>
              <div style={s.pinDot} />
              <div style={s.pinShadow} />
            </div>
          </div>
        </div>

        {/* כתובת אוטומטית */}
        <div style={s.section}>
          <p style={s.sectionLabel}>כתובת אוטומטית:</p>
          {!searching ? (
            <div style={s.addrRow}>
              <span style={s.addrText}>
                {locating
                  ? "⏳ מאתר מיקום..."
                  : (displayAddr || street?.name || "לא זוהתה")}
              </span>
              {!locating && (
                <span style={{ fontSize: 10, color: "#7880a0", marginTop: 2, display: "block" }}>
                  {userPos ? `📍 ${userPos[0].toFixed(4)}, ${userPos[1].toFixed(4)}` : "⚠️ אין GPS"}
                </span>
              )}
              <button style={s.changeBtn} onClick={() => setSearching(true)}>שנה</button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input
                autoFocus
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="חפש רחוב..."
                style={s.input}
              />
              {searchResults.length > 0 && (
                <div style={s.dropdown}>
                  {searchResults.map(r => (
                    <div
                      key={r.name}
                      style={s.dropItem}
                      onClick={() => { setStreet(r); setDisplayAddr(r.name); setSearching(false); setSearchQ(""); }}
                    >
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span style={{ color: "#7880a0", fontSize: 11 }}>הוצאה: {r.takeout_day}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={s.divider} />

        {/* סוג החפץ — טקסט חופשי */}
        <div style={s.section}>
          <label style={s.fieldLabel}>סוג החפץ</label>
          <input
            value={itemType}
            onChange={e => setItemType(e.target.value)}
            placeholder="למשל: ספה, מקרר, שולחן, גזם..."
            style={s.input}
          />
        </div>

        {/* תיאור קצר */}
        <div style={s.section}>
          <label style={s.fieldLabel}>תיאור קצר</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="פרטים נוספים על החפץ..."
            style={s.input}
          />
        </div>

        {/* מצב הפריט */}
        <div style={s.section}>
          <label style={s.fieldLabel}>מצב הפריט</label>
          <div style={s.condRow}>
            {CONDITIONS.map(c => (
              <button
                key={c}
                onClick={() => setCondition(condition === c ? "" : c)}
                style={{
                  ...s.condChip,
                  background: condition === c ? "#1a73e8" : "#22263a",
                  borderColor: condition === c ? "#1a73e8" : "#2e3348",
                  color:       condition === c ? "#fff"    : "#7880a0",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* פרטים נוספים */}
        <div style={s.section}>
          <label style={s.fieldLabel}>פרטים נוספים</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="כל מידע שיעזור לצוות הפינוי..."
            rows={3}
            style={{ ...s.input, resize: "none", lineHeight: 1.5 }}
          />
        </div>

        {/* צרף תמונה */}
        <div style={s.section}>
          <label style={s.fieldLabel}>צרף תמונה</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handlePhotoChange}
          />
          {!photoPreview ? (
            <button
              type="button"
              style={s.photoBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
              <span>צלם / בחר תמונה</span>
            </button>
          ) : (
            <div style={s.photoPreviewWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="preview" style={s.photoPreviewImg} />
              <button style={s.photoRemoveBtn} onClick={removePhoto}>✕</button>
            </div>
          )}
        </div>

        {/* פרטי הדיווח — שעה + זמן לפינוי */}
        {street?.takeout_day && (
          <div style={s.reportMeta}>
            <span style={s.metaChip}>
              🕐 {reportTime}
            </span>
            <span style={s.metaSep}>|</span>
            <span style={s.metaChip}>
              ⏱ זמן {hoursUntilDay(street.takeout_day)}ש' לפינוי
            </span>
          </div>
        )}

        {/* תיבת מידע — יום פינוי הרלוונטי */}
        {street?.takeout_day && (
          <div style={s.infoBox}>
            <span style={{ fontSize: 20 }}>📅</span>
            <p style={s.infoText}>
              יום פינוי הבא בכתובת זו:{" "}
              <strong>{street.collection_day}</strong>{" "}
              <strong style={{ color: "#86efac" }}>
                {labelUntilDay(street.takeout_day)}
              </strong>
              <br />
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                הוצאה: {street.takeout_day} · פינוי: {street.collection_day}
              </span>
            </p>
          </div>
        )}

        {/* סמן אם נלקח */}
        <label style={s.takenRow}>
          <input
            type="checkbox"
            checked={isTaken}
            onChange={e => setIsTaken(e.target.checked)}
            style={s.checkbox}
          />
          <span style={s.takenLabel}>סמן אם נלקח</span>
        </label>

        {err && <p style={s.errText}>{err}</p>}

        {/* כפתור שליחה */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !street || !itemType.trim()}
          style={{
            ...s.submitBtn,
            opacity: submitting || !street || !itemType.trim() ? 0.55 : 1,
          }}
        >
          {submitting ? "שולח..." : "שלח דיווח"}
        </button>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ── styles ──
const s: Record<string, React.CSSProperties> = {
  root: {
    height: "100%",
    background: "#0f1117",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Heebo', sans-serif",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid #2e3348",
    background: "#1a1d27",
    flexShrink: 0,
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#7880a0",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: 900,
    color: "#e8eaf2",
    margin: 0,
  },
  scroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
  },

  // ── כרטיס מיקום ──
  locationCard: {
    margin: "16px 16px 0",
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid #2e3348",
    flexShrink: 0,
  },
  mapBg: {
    height: 130,
    background: "#1a2a3a",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  pinWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
    zIndex: 1,
  },
  pinBubble: {
    background: "#fff",
    borderRadius: 12,
    padding: "8px 14px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    textAlign: "center",
    marginBottom: 6,
  },
  pinTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#1a73e8",
    margin: 0,
  },
  pinAddr: {
    fontSize: 13,
    fontWeight: 800,
    color: "#111",
    margin: "2px 0 0",
  },
  pinCity: {
    fontSize: 11,
    color: "#555",
    margin: 0,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#1a73e8",
    border: "3px solid #fff",
    boxShadow: "0 2px 8px rgba(26,115,232,0.6)",
  },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.25)",
    marginTop: 2,
  },

  // ── שדות ──
  section: {
    padding: "14px 16px 0",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#7880a0",
    margin: "0 0 6px",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldLabel: {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    color: "#b0b8d4",
    marginBottom: 7,
  },
  addrRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#1a1d27",
    border: "1px solid #2e3348",
    borderRadius: 10,
    padding: "10px 14px",
  },
  addrText: {
    fontSize: 15,
    fontWeight: 700,
    color: "#e8eaf2",
  },
  changeBtn: {
    background: "none",
    border: "1px solid #2e3348",
    borderRadius: 8,
    color: "#1a73e8",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 10px",
    cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
    flexShrink: 0,
  },
  input: {
    width: "100%",
    background: "#1a1d27",
    border: "1px solid #2e3348",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 15,
    color: "#e8eaf2",
    fontFamily: "'Heebo', sans-serif",
    outline: "none",
    boxSizing: "border-box",
    direction: "rtl",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    background: "#1a1d27",
    border: "1px solid #2e3348",
    borderRadius: 10,
    marginTop: 4,
    zIndex: 200,
    overflow: "hidden",
  },
  dropItem: {
    padding: "10px 14px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    color: "#e8eaf2",
    fontSize: 14,
    borderBottom: "1px solid #2e3348",
  },
  condRow: {
    display: "flex",
    gap: 8,
  },
  condChip: {
    flex: 1,
    padding: "9px 0",
    borderRadius: 10,
    border: "1px solid",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
    transition: "all 0.15s",
  },
  divider: {
    height: 1,
    background: "#2e3348",
    margin: "16px 16px 0",
  },

  // ── צרף תמונה ──
  photoBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    background: "#1a1d27",
    border: "1.5px dashed #2e3348",
    borderRadius: 10,
    padding: "14px 16px",
    color: "#7880a0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
    transition: "border-color 0.15s, color 0.15s",
  },
  photoPreviewWrap: {
    position: "relative",
    display: "inline-block",
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #2e3348",
  },
  photoPreviewImg: {
    display: "block",
    width: "100%",
    maxHeight: 160,
    objectFit: "cover",
    borderRadius: 12,
  },
  photoRemoveBtn: {
    position: "absolute",
    top: 6,
    left: 6,
    background: "rgba(0,0,0,0.65)",
    border: "none",
    color: "#fff",
    borderRadius: "50%",
    width: 26,
    height: 26,
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── פרטי הדיווח ──
  reportMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "16px 16px 0",
    background: "#1a1d27",
    border: "1px solid #2e3348",
    borderRadius: 10,
    padding: "9px 14px",
  },
  metaChip: {
    fontSize: 13,
    fontWeight: 600,
    color: "#b0b8d4",
  },
  metaSep: {
    color: "#2e3348",
    fontSize: 14,
  },

  // ── סמן אם נלקח ──
  takenRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "14px 16px 0",
    cursor: "pointer",
    padding: "10px 14px",
    background: "#1a1d27",
    border: "1px solid #2e3348",
    borderRadius: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: "#1a73e8",
    cursor: "pointer",
    flexShrink: 0,
  },
  takenLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#b0b8d4",
  },

  // ── תיבת מידע ──
  infoBox: {
    margin: "16px 16px 0",
    background: "#0f2a1a",
    border: "1px solid #1a4d2e",
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    fontSize: 13,
    color: "#86efac",
    margin: 0,
    lineHeight: 1.5,
  },

  errText: {
    color: "#f87171",
    fontSize: 13,
    margin: "10px 16px 0",
  },

  // ── כפתור ──
  submitBtn: {
    display: "block",
    width: "calc(100% - 32px)",
    margin: "16px 16px 0",
    background: "#1a5c2e",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "15px",
    fontSize: 17,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
    letterSpacing: 0.3,
  },

  // ── הצלחה ──
  successBox: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 40,
    fontFamily: "'Heebo', sans-serif",
    color: "#e8eaf2",
  },
};
