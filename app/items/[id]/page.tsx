"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const CAT_EMOJI: Record<string, string> = {
  furniture: "🪑", books: "📚", lighting: "💡", plants: "🌿",
  sports: "⚽", electronics: "📺", kitchen: "🍳", kids: "🧸",
};
const CAT_COLOR: Record<string, string> = {
  furniture: "var(--warning-tint)", books: "var(--info-tint)",
  lighting: "var(--accent-tint)", plants: "var(--primary-light)",
  sports: "var(--info-tint)", electronics: "var(--paper-2)",
  kitchen: "var(--warning-tint)", kids: "var(--accent-tint)",
};
const COND_LABEL: Record<string, string> = {
  new: "✨ חדש", like_new: "👌 כמו חדש", good: "👍 טוב", fair: "🆗 סביר",
};

interface Item {
  id: string; title: string; description: string | null;
  category: string; condition: string; tags: string[] | null;
  address: string; pickup_day: string | null; status: string;
  created_at: string; reporter_id: string;
  lat: number | null; lng: number | null;
}
interface Image { url: string; position: number; is_primary: boolean; }
interface Reporter { name: string | null; avatar_color: string | null; xp: number; }

function timeAgo(iso: string) {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (d < 1)  return "עכשיו";
  if (d < 60) return `לפני ${d} דק'`;
  if (d < 1440) return `לפני ${Math.round(d/60)} ש'`;
  return `לפני ${Math.round(d/1440)} ימים`;
}

export default function ItemDetailPage() {
  const router  = useRouter();
  const params  = useParams();
  const id      = params.id as string;

  const [item,     setItem]     = useState<Item | null>(null);
  const [images,   setImages]   = useState<Image[]>([]);
  const [reporter, setReporter] = useState<Reporter | null>(null);
  const [userId,   setUserId]   = useState<string | null>(null);
  const [saved,      setSaved]      = useState(false);
  const [marking,    setMarking]    = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [activeImg,    setActiveImg]    = useState<Image | null>(null);
  const [clearanceDay, setClearanceDay] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      setUserId(session.user.id);

      const [{ data: it }, { data: imgs }] = await Promise.all([
        supabase.from("items").select("*").eq("id", id).single(),
        supabase.from("item_images").select("url,position,is_primary")
          .eq("item_id", id).order("position"),
      ]);

      if (!it) { router.replace("/map"); return; }
      setItem(it as Item);
      const imgList = (imgs ?? []) as Image[];
      setImages(imgList);
      setActiveImg(imgList.find(i => i.is_primary) ?? imgList[0] ?? null);

      // Load reporter profile
      const { data: rep } = await supabase.from("profiles")
        .select("name,avatar_color,xp").eq("id", it.reporter_id).single();
      if (rep) setReporter(rep as Reporter);

      // Check if saved
      const { data: sv } = await supabase.from("saved_items")
        .select("item_id").eq("user_id", session.user.id).eq("item_id", id).maybeSingle();
      setSaved(!!sv);

      // Resolve clearance day from street schedule
      const { data: schedule } = await supabase
        .from("clearance_schedule").select("street_name,clearance_day");
      if (schedule?.length && it) {
        const norm = (s: string) => s.replace(/['"״"""]/g, "").trim();
        /* prefer Hebrew reverse-geocode if coordinates exist */
        let heStreet: string | null = null;
        if (it.lat && it.lng) {
          try {
            const rg = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${it.lat}&lon=${it.lng}&format=json&accept-language=he`
            );
            const geo = await rg.json();
            heStreet = geo.address?.road ?? null;
          } catch { /* ignore */ }
        }
        const haystack = norm(heStreet ?? it.address);
        const match = schedule.find(s =>
          haystack.includes(norm(s.street_name)) ||
          norm(s.street_name).includes(haystack.split(",")[0])
        );
        if (match) setClearanceDay(match.clearance_day);
      }

      setLoading(false);
    }
    load();
  }, [id, router]);

  async function toggleSave() {
    if (!userId) return;
    if (saved) {
      await supabase.from("saved_items").delete()
        .eq("user_id", userId).eq("item_id", id);
    } else {
      await supabase.from("saved_items").insert({ user_id: userId, item_id: id });
    }
    setSaved(s => !s);
  }

  async function handleNavigate() {
    if (!item || navigating) return;
    setNavigating(true);
    let lat = item.lat, lng = item.lng;
    /* geocode address if coordinates not stored */
    if (!lat || !lng) {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(item.address)}&format=json&limit=1`
        );
        const d = await r.json();
        if (d[0]) { lat = parseFloat(d[0].lat); lng = parseFloat(d[0].lon); }
      } catch { /* ignore */ }
    }
    if (lat && lng) {
      router.push(`/map?nav_lat=${lat}&nav_lng=${lng}&nav_title=${encodeURIComponent(item.title)}`);
    } else {
      router.push("/map");
    }
    setNavigating(false);
  }

  async function markTaken() {
    if (!item || marking) return;
    setMarking(true);
    await supabase.from("items").update({ status: "taken", taken_at: new Date().toISOString() })
      .eq("id", id);
    setItem(prev => prev ? { ...prev, status: "taken" } : prev);
    setMarking(false);
  }

  async function shareItem() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: item?.title, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert("הקישור הועתק!");
    }
  }

  if (loading || !item) {
    return (
      <div style={{
        minHeight:"100dvh", background:"var(--paper)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"var(--font-sans)",
      }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🌿</div>
          <div style={{ color:"var(--muted)", fontWeight:600 }}>טוען…</div>
        </div>
      </div>
    );
  }

  const emoji = CAT_EMOJI[item.category] ?? "📦";
  const color = CAT_COLOR[item.category]  ?? "var(--paper-2)";
  const today    = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split("T")[0];
  const urgent   = item.pickup_day === today || item.pickup_day === tomorrow;
  const taken    = item.status === "taken";

  const primaryImg = activeImg ?? images.find(i => i.is_primary) ?? images[0];
  const initials   = (reporter?.name || "?").charAt(0).toUpperCase();

  return (
    <div style={{
      minHeight:"100dvh", background:"var(--paper)",
      fontFamily:"var(--font-sans)",
    }}>
      {/* ─── top nav ─── */}
      <div style={{
        position:"sticky", top:0, zIndex:30,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"12px 16px",
        background:"rgba(245,242,232,0.9)", backdropFilter:"blur(8px)",
        borderBottom:"1.5px solid var(--ink)",
      }}>
        <button
          onClick={() => router.back()}
          style={{
            width:38, height:38, borderRadius:"50%",
            background:"var(--surface)", border:"2px solid var(--ink)",
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", padding:0, boxShadow:"var(--sh-sm)",
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M15 18l6-6-6-6"/>
          </svg>
        </button>
        <div style={{
          fontFamily:"var(--font-display)", fontWeight:900,
          fontSize:17, letterSpacing:"-0.01em",
        }}>פרטי פריט</div>
        <div style={{ display:"flex", gap:8 }}>
          <button
            onClick={toggleSave}
            style={{
              width:38, height:38, borderRadius:"50%",
              background: saved ? "var(--accent-tint)" : "var(--surface)",
              border:"2px solid var(--ink)",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", padding:0, boxShadow:"var(--sh-sm)",
            }}
          >
            <svg width={17} height={17} viewBox="0 0 24 24"
              fill={saved ? "var(--accent)" : "none"}
              stroke={saved ? "var(--accent)" : "currentColor"} strokeWidth={1.8} strokeLinecap="round">
              <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>
            </svg>
          </button>
          <button
            onClick={shareItem}
            style={{
              width:38, height:38, borderRadius:"50%",
              background:"var(--surface)", border:"2px solid var(--ink)",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", padding:0, boxShadow:"var(--sh-sm)",
            }}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <circle cx={18} cy={5} r={3}/><circle cx={6} cy={12} r={3}/><circle cx={18} cy={19} r={3}/>
              <line x1={8.59} y1={13.51} x2={15.42} y2={17.49}/>
              <line x1={15.41} y1={6.51} x2={8.59} y2={10.49}/>
            </svg>
          </button>
        </div>
      </div>

      {/* ─── hero image ─── */}
      <div style={{
        height: 280,
        background: primaryImg ? `url(${primaryImg.url}) center/cover no-repeat` : color,
        borderBottom:"2px solid var(--ink)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize: primaryImg ? undefined : 96,
        position:"relative",
      }}>
        {!primaryImg && emoji}

        {urgent && !taken && (
          <div style={{
            position:"absolute", top:16, right:16,
            padding:"5px 12px", borderRadius:999,
            background:"var(--accent)", color:"white",
            border:"2px solid var(--ink)",
            fontSize:12, fontWeight:800,
            boxShadow:"2px 2px 0 rgba(45,42,36,0.2)",
          }}>🔥 מהר! פינוי {item.pickup_day === today ? "היום" : "מחר"}</div>
        )}
        {taken && (
          <div style={{
            position:"absolute", inset:0,
            background:"rgba(45,42,36,0.5)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <div style={{
              padding:"10px 24px", borderRadius:999,
              background:"var(--surface)", border:"2px solid var(--ink)",
              fontFamily:"var(--font-display)", fontWeight:900, fontSize:22,
            }}>✅ נלקח</div>
          </div>
        )}
      </div>

      {/* ─── image thumbnails ─── */}
      {images.length > 1 && (
        <div style={{
          display:"flex", gap:8, padding:"12px 16px",
          overflowX:"auto", scrollbarWidth:"none",
          borderBottom:"1.5px solid var(--border)",
        }}>
          {images.map((img, i) => (
            <div
              key={i}
              onClick={() => setActiveImg(img)}
              style={{
                width:60, height:60, flexShrink:0, borderRadius:10,
                border:`2px solid ${activeImg?.url === img.url ? "var(--primary)" : "var(--ink)"}`,
                background:`url(${img.url}) center/cover no-repeat`,
                boxShadow:"1.5px 1.5px 0 var(--shadow-ink)",
                cursor:"pointer",
                outline: activeImg?.url === img.url ? "2px solid var(--primary)" : "none",
                outlineOffset:2,
                transition:"outline 120ms, border-color 120ms",
              }}
            />
          ))}
        </div>
      )}

      {/* ─── info body ─── */}
      <div style={{ padding:"20px 16px 100px" }}>

        {/* title + condition */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
          <h1 style={{
            fontFamily:"var(--font-display)", fontWeight:900,
            fontSize:26, lineHeight:1.15, letterSpacing:"-0.01em",
            color:"var(--ink)", margin:0, flex:1,
          }}>{item.title}</h1>
          <span style={{
            padding:"5px 12px", borderRadius:999, fontSize:12, fontWeight:800,
            background:"var(--surface)", border:"2px solid var(--ink)",
            boxShadow:"1.5px 1.5px 0 var(--shadow-ink)", flexShrink:0,
            whiteSpace:"nowrap",
          }}>
            {COND_LABEL[item.condition] ?? item.condition}
          </span>
        </div>

        {/* category + time */}
        <div style={{
          display:"flex", gap:8, alignItems:"center", marginTop:10, flexWrap:"wrap",
        }}>
          <span style={{
            display:"inline-flex", alignItems:"center", gap:5,
            padding:"4px 12px", borderRadius:999, fontSize:12, fontWeight:700,
            background: color, border:"1.5px solid var(--ink)",
          }}>
            {emoji} {item.category}
          </span>
          <span style={{ fontSize:12, color:"var(--muted)", fontWeight:500 }}>
            {timeAgo(item.created_at)}
          </span>
        </div>

        {/* tags */}
        {item.tags && item.tags.length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:12 }}>
            {item.tags.map(t => (
              <span key={t} style={{
                padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:700,
                background:"var(--surface)", border:"1.5px solid var(--ink)",
              }}>#{t}</span>
            ))}
          </div>
        )}

        {/* description */}
        {item.description && (
          <div style={{
            marginTop:18, padding:14,
            background:"var(--surface)", border:"2px solid var(--ink)",
            borderRadius:14, boxShadow:"var(--sh-sm)",
            fontSize:14, lineHeight:1.6, fontWeight:500, color:"var(--ink)",
          }}>{item.description}</div>
        )}

        {/* location */}
        <div style={{
          marginTop:14, padding:"12px 14px",
          background:"var(--surface)", border:"2px solid var(--ink)",
          borderRadius:14, boxShadow:"var(--sh-sm)",
          display:"flex", alignItems:"center", gap:10,
        }}>
          <span style={{ fontSize:20 }}>📍</span>
          <div>
            <div style={{ fontWeight:700, fontSize:14 }}>{item.address}</div>
            {item.pickup_day && (
              <div style={{ fontSize:12, color:"var(--muted)", fontWeight:500, marginTop:2 }}>
                פינוי: {item.pickup_day === today ? "היום 🔥" :
                        item.pickup_day === tomorrow ? "מחר" : item.pickup_day}
              </div>
            )}
            {clearanceDay && (
              <div style={{ fontSize:12, color:"var(--ink)", fontWeight:600, marginTop:4,
                display:"flex", alignItems:"center", gap:4 }}>
                <span>🚛</span>
                <span>יום פינוי עירוני: <strong>{clearanceDay}</strong></span>
              </div>
            )}
          </div>
        </div>

        {/* reporter */}
        {reporter && (
          <div style={{
            marginTop:14, padding:"12px 14px",
            background:"var(--primary-tint)", border:"2px solid var(--ink)",
            borderRadius:14, boxShadow:"var(--sh-sm)",
            display:"flex", alignItems:"center", gap:12,
          }}>
            <div style={{
              width:40, height:40, borderRadius:"50%", flexShrink:0,
              background: reporter.avatar_color ?? "var(--warning-tint)",
              border:"2px solid var(--ink)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontFamily:"var(--font-display)", fontWeight:900, fontSize:18,
            }}>{initials}</div>
            <div>
              <div style={{ fontWeight:800, fontSize:13 }}>
                {reporter.name ?? "GreenHOODer"}
              </div>
              <div style={{ fontSize:11, color:"var(--muted)", fontWeight:500 }}>
                🏆 {Math.floor((reporter.xp ?? 0)/100)+1} רמה · {reporter.xp ?? 0} XP
              </div>
            </div>
            <div style={{ marginRight:"auto", fontSize:11, color:"var(--muted)", fontWeight:600 }}>
              דיווח
            </div>
          </div>
        )}
      </div>

      {/* ─── bottom action bar ─── */}
      {!taken && (
        <div style={{
          position:"fixed", bottom:0, left:0, right:0,
          padding:"12px 16px calc(12px + env(safe-area-inset-bottom))",
          background:"var(--paper)",
          borderTop:"2px solid var(--ink)",
          display:"flex", gap:10,
          zIndex:20,
        }}>
          {/* Chat button — small, icon only */}
          <button
            onClick={() => router.push(`/chat/${id}`)}
            style={{
              width:56, height:56, flexShrink:0,
              background:"var(--surface)",
              border:"2px solid var(--ink)", borderRadius:14,
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", padding:0, boxShadow:"var(--sh-md)",
            }}
          >
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
              stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>

          {/* Primary action */}
          {item.reporter_id !== userId ? (
            <button
              onClick={markTaken}
              disabled={marking}
              style={{
                flex:1, padding:"14px 0",
                background: marking ? "var(--muted)" : "var(--ink)",
                color:"var(--paper)",
                border:"2px solid var(--ink)", borderRadius:14,
                fontFamily:"var(--font-sans)", fontWeight:900,
                fontSize:15, cursor: marking ? "not-allowed" : "pointer",
                boxShadow:"3px 3px 0 var(--primary)",
              }}
            >{marking ? "מעדכן..." : "✅ סמן כנלקח"}</button>
          ) : (
            <button
              onClick={handleNavigate}
              disabled={navigating}
              style={{
                flex:1, height:56,
                background: navigating ? "var(--primary-tint)" : "var(--primary)",
                color:"var(--ink)",
                border:"2px solid var(--ink)", borderRadius:"var(--r-md)",
                fontFamily:"var(--font-sans)", fontWeight:700,
                fontSize:17, cursor: navigating ? "not-allowed" : "pointer",
                boxShadow:"var(--sh-md)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                opacity: navigating ? 0.55 : 1,
                transition:"opacity 200ms, background 200ms",
              }}
            >
              {navigating ? "🔍 מאתר…" : (
                <>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                    stroke="var(--ink)" strokeWidth={2} strokeLinecap="round">
                    <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                  </svg>
                  נווט אליי
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
