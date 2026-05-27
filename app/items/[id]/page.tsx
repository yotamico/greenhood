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
  const [saved,    setSaved]    = useState(false);
  const [marking,  setMarking]  = useState(false);
  const [loading,  setLoading]  = useState(true);

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
      setImages((imgs ?? []) as Image[]);

      // Load reporter profile
      const { data: rep } = await supabase.from("profiles")
        .select("name,avatar_color,xp").eq("id", it.reporter_id).single();
      if (rep) setReporter(rep as Reporter);

      // Check if saved
      const { data: sv } = await supabase.from("saved_items")
        .select("item_id").eq("user_id", session.user.id).eq("item_id", id).maybeSingle();
      setSaved(!!sv);
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

  const primaryImg = images.find(i => i.is_primary) ?? images[0];
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
            <div key={i} style={{
              width:60, height:60, flexShrink:0, borderRadius:10,
              border:`2px solid ${img.is_primary ? "var(--primary)" : "var(--ink)"}`,
              background:`url(${img.url}) center/cover no-repeat`,
              boxShadow:"1.5px 1.5px 0 var(--shadow-ink)",
            }}/>
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
          <button
            onClick={() => {
              const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(item.address)}`;
              window.open(mapsUrl, "_blank");
            }}
            style={{
              flex:1, padding:"14px 0",
              background:"var(--surface)", border:"2px solid var(--ink)",
              borderRadius:14, fontFamily:"var(--font-sans)", fontWeight:800,
              fontSize:14, cursor:"pointer",
              boxShadow:"var(--sh-md)",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}
          >🗺️ נווט</button>

          {item.reporter_id === userId ? (
            <button
              onClick={markTaken}
              disabled={marking}
              style={{
                flex:2, padding:"14px 0",
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
              onClick={() => {
                const wa = `https://wa.me/?text=${encodeURIComponent(`ראיתי את "${item.title}" ב-GreenHOOD!\n${window.location.href}`)}`;
                window.open(wa, "_blank");
              }}
              style={{
                flex:2, padding:"14px 0",
                background:"var(--ink)", color:"var(--paper)",
                border:"2px solid var(--ink)", borderRadius:14,
                fontFamily:"var(--font-sans)", fontWeight:900,
                fontSize:15, cursor:"pointer",
                boxShadow:"3px 3px 0 var(--primary)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.138.563 4.144 1.548 5.879L.057 23.857a.5.5 0 0 0 .611.611l6.094-1.497A11.955 11.955 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.952 9.952 0 0 1-5.145-1.429l-.369-.218-3.817.938.963-3.73-.241-.386A9.952 9.952 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
              אני בא לקחת!
            </button>
          )}
        </div>
      )}
    </div>
  );
}
