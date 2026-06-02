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
  const router = useRouter();
  const params = useParams();
  const id     = params.id as string;

  const [item,         setItem]         = useState<Item | null>(null);
  const [images,       setImages]       = useState<Image[]>([]);
  const [reporter,     setReporter]     = useState<Reporter | null>(null);
  const [userId,       setUserId]       = useState<string | null>(null);
  const [saved,        setSaved]        = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [navigating,   setNavigating]   = useState(false);
  const [activeImg,    setActiveImg]    = useState<Image | null>(null);
  const [clearanceDay, setClearanceDay] = useState<string | null>(null);
  const [savesCount,   setSavesCount]   = useState(0);
  const [msgsCount,    setMsgsCount]    = useState(0);
  const [itemStatus,   setItemStatus]   = useState<"active"|"taken"|"removed">("active");
  const [deleting,     setDeleting]     = useState(false);
  const [lightboxUrl,  setLightboxUrl]  = useState<string | null>(null);

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
      setItemStatus(it.status === "taken" ? "taken" : it.status === "removed" ? "removed" : "active");

      const imgList = (imgs ?? []) as Image[];
      setImages(imgList);
      setActiveImg(imgList.find(i => i.is_primary) ?? imgList[0] ?? null);

      const [{ data: rep }, { data: sv }, { data: sched }, { count: sc }, { count: mc }] = await Promise.all([
        supabase.from("profiles").select("name,avatar_color,xp").eq("id", it.reporter_id).single(),
        supabase.from("saved_items").select("item_id").eq("user_id", session.user.id).eq("item_id", id).maybeSingle(),
        supabase.from("clearance_schedule").select("street_name,clearance_day"),
        supabase.from("saved_items").select("*", { count:"exact", head:true }).eq("item_id", id),
        supabase.from("messages").select("*", { count:"exact", head:true }).eq("item_id", id),
      ]);

      if (rep) setReporter(rep as Reporter);
      setSaved(!!sv);
      setSavesCount(sc ?? 0);
      setMsgsCount(mc ?? 0);

      if (sched?.length && it) {
        const norm = (s: string) => s.replace(/['"״"""]/g, "").trim();
        let heStreet: string | null = null;
        if (it.lat && it.lng) {
          try {
            const rg = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${it.lat}&lon=${it.lng}&format=json&accept-language=he`);
            const geo = await rg.json();
            heStreet = geo.address?.road ?? null;
          } catch { /* ignore */ }
        }
        const haystack = norm(heStreet ?? it.address);
        const match = sched.find(s =>
          haystack.includes(norm(s.street_name)) || norm(s.street_name).includes(haystack.split(",")[0])
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
      await supabase.from("saved_items").delete().eq("user_id", userId).eq("item_id", id);
      setSavesCount(c => Math.max(0, c - 1));
    } else {
      await supabase.from("saved_items").insert({ user_id: userId, item_id: id });
      setSavesCount(c => c + 1);
    }
    setSaved(s => !s);
  }

  async function handleNavigate() {
    if (!item || navigating) return;
    setNavigating(true);
    let lat = item.lat, lng = item.lng;
    if (!lat || !lng) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(item.address)}&format=json&limit=1`);
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

  async function updateStatus(s: "active"|"taken"|"removed") {
    setItemStatus(s);
    const upd: Record<string, unknown> = { status: s };
    if (s === "taken") upd.taken_at = new Date().toISOString();
    await supabase.from("items").update(upd).eq("id", id);
    setItem(prev => prev ? { ...prev, status: s } : prev);
  }

  async function deleteItem() {
    if (!confirm("למחוק את הפריט לצמיתות?")) return;
    setDeleting(true);
    await supabase.from("items").delete().eq("id", id);
    router.replace("/me");
  }

  async function shareItem() {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: item?.title, url });
    else { await navigator.clipboard.writeText(url); alert("הקישור הועתק!"); }
  }

  if (loading || !item) {
    return (
      <div style={{ minHeight:"100dvh", background:"var(--paper)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-sans)" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🌿</div>
          <div style={{ color:"var(--muted)", fontWeight:600 }}>טוען…</div>
        </div>
      </div>
    );
  }

  const isOwner   = item.reporter_id === userId;
  const emoji     = CAT_EMOJI[item.category] ?? "📦";
  const color     = CAT_COLOR[item.category] ?? "var(--paper-2)";
  const today     = new Date().toISOString().split("T")[0];
  const tomorrow  = new Date(Date.now()+86400000).toISOString().split("T")[0];
  const urgent    = item.pickup_day === today || item.pickup_day === tomorrow;
  const taken     = itemStatus === "taken";
  const removed   = itemStatus === "removed";
  const primaryImg = activeImg ?? images.find(i => i.is_primary) ?? images[0];
  const initials  = (reporter?.name || "?").charAt(0).toUpperCase();

  const floatBtn: React.CSSProperties = {
    width:40, height:40, borderRadius:"50%",
    background:"rgba(245,242,232,0.92)", border:"2px solid var(--ink)",
    display:"flex", alignItems:"center", justifyContent:"center",
    cursor:"pointer", padding:0,
    boxShadow:"2px 2px 0 rgba(45,42,36,0.2)",
  };

  return (
    <div style={{ minHeight:"100dvh", background:"var(--paper)", fontFamily:"var(--font-sans)", display:"flex", flexDirection:"column" }}>

      {/* lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{
          position:"fixed", inset:0, zIndex:9999,
          background:"rgba(45,42,36,0.88)", display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="" style={{ maxWidth:"95vw", maxHeight:"88vh", objectFit:"contain", borderRadius:12, border:"3px solid var(--ink)" }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightboxUrl(null)} style={{ position:"absolute", top:18, right:18, background:"var(--surface)", border:"2px solid var(--ink)", borderRadius:"50%", width:38, height:38, fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
      )}

      {/* ── Hero ── */}
      <div style={{
        position:"relative",
        height: isOwner ? "36vh" : "40vh",
        flexShrink:0,
        background: primaryImg ? `url(${primaryImg.url}) center/cover no-repeat` : color,
        borderBottom:"2px solid var(--ink)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize: primaryImg ? undefined : 96,
      }}>
        {!primaryImg && emoji}

        {/* Floating control row */}
        <div style={{ position:"absolute", top:12, left:12, right:12, zIndex:3, display:"flex", justifyContent:"space-between" }}>
          <button onClick={() => router.back()} style={floatBtn}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M15 18l6-6-6-6"/>
            </svg>
          </button>
          <div style={{ display:"flex", gap:8 }}>
            {isOwner ? (
              <>
                <button onClick={shareItem} style={floatBtn}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                    <circle cx={18} cy={5} r={3}/><circle cx={6} cy={12} r={3}/><circle cx={18} cy={19} r={3}/>
                    <line x1={8.59} y1={13.51} x2={15.42} y2={17.49}/>
                    <line x1={15.41} y1={6.51} x2={8.59} y2={10.49}/>
                  </svg>
                </button>
                <button onClick={deleteItem} disabled={deleting} style={{ ...floatBtn, background:"rgba(201,116,100,0.92)" }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.75} strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button onClick={shareItem} style={floatBtn}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                    <circle cx={18} cy={5} r={3}/><circle cx={6} cy={12} r={3}/><circle cx={18} cy={19} r={3}/>
                    <line x1={8.59} y1={13.51} x2={15.42} y2={17.49}/>
                    <line x1={15.41} y1={6.51} x2={8.59} y2={10.49}/>
                  </svg>
                </button>
                <button onClick={toggleSave} style={{ ...floatBtn, background: saved ? "rgba(201,116,100,0.92)" : "rgba(245,242,232,0.92)" }}>
                  <svg width={17} height={17} viewBox="0 0 24 24"
                    fill={saved ? "white" : "none"}
                    stroke={saved ? "white" : "currentColor"} strokeWidth={1.8} strokeLinecap="round">
                    <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Owner badge */}
        {isOwner && (
          <div style={{
            position:"absolute", bottom:10, right:12, zIndex:3,
            padding:"5px 12px", borderRadius:999,
            background:"var(--primary)", color:"white",
            fontSize:11, fontWeight:800, border:"1.5px solid var(--ink)",
          }}>הפריט שלי</div>
        )}

        {/* Taken / Removed overlay */}
        {(taken || removed) && (
          <div style={{ position:"absolute", inset:0, background:"rgba(45,42,36,0.5)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ padding:"10px 24px", borderRadius:999, background:"var(--surface)", border:"2px solid var(--ink)", fontFamily:"var(--font-display)", fontWeight:900, fontSize:22 }}>
              {taken ? "✅ נלקח" : "🚫 הוסר"}
            </div>
          </div>
        )}
      </div>

      {/* ── Owner: Stats bar ── */}
      {isOwner && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", borderBottom:"1.5px solid var(--ink)", flexShrink:0 }}>
          {[
            ["👁", "—",        "צפיות"],
            ["♡", savesCount,  "שמרו"],
            ["💬", msgsCount,  "פניות"],
          ].map(([icon, val, label], i) => (
            <div key={i} style={{ padding:"10px 0", textAlign:"center", borderLeft: i > 0 ? "1.5px solid var(--line-strong)" : "none" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20 }}>{icon} {val}</div>
              <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Non-owner: Thumbnail row ── */}
      {!isOwner && images.length > 1 && (
        <div style={{ display:"flex", gap:8, padding:"10px 16px", borderBottom:"1.5px solid var(--ink)", flexShrink:0, overflowX:"auto", scrollbarWidth:"none" }}>
          {images.slice(0, 3).map((img, i) => (
            <div key={i} onClick={() => setActiveImg(img)} style={{
              width:52, height:52, flexShrink:0, borderRadius:10, cursor:"pointer",
              border:`2px solid ${activeImg?.url === img.url ? "var(--ink)" : "var(--line-strong)"}`,
              background:`url(${img.url}) center/cover no-repeat`,
              boxShadow: activeImg?.url === img.url ? "2px 2px 0 var(--shadow-ink)" : "none",
            }}/>
          ))}
          {images.length > 3 && (
            <div style={{
              width:52, height:52, flexShrink:0, borderRadius:10,
              background:"var(--paper-2)", border:"2px solid var(--line-strong)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontFamily:"var(--font-display)", fontWeight:800, fontSize:14, color:"var(--ink)",
            }}>+{images.length - 3}</div>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"18px 20px 110px" }}>

        {/* Title + urgent tag */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:8 }}>
          <h1 style={{
            fontFamily:"var(--font-display)", fontWeight:900,
            fontSize: isOwner ? 22 : 24, lineHeight:1.15,
            letterSpacing:"-0.01em", color:"var(--ink)", margin:0, flex:1,
          }}>{item.title}</h1>
          {urgent && !taken && !removed && (
            <span style={{
              flexShrink:0, padding:"5px 10px", borderRadius:999, fontSize:11, fontWeight:800,
              background:"var(--accent)", color:"white", border:"1.5px solid var(--ink)",
              whiteSpace:"nowrap",
            }}>🔥 פינוי {item.pickup_day === today ? "היום" : "מחר"}</span>
          )}
        </div>

        {/* Non-owner: meta line */}
        {!isOwner && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, fontSize:13, color:"var(--muted)", fontWeight:500, marginBottom:14, direction:"rtl" }}>
            {reporter && <span>דיווח: <strong style={{ color:"var(--ink-soft)" }}>{reporter.name ?? "GreenHOODer"}</strong></span>}
            <span>·</span>
            <span>{timeAgo(item.created_at)}</span>
            <span>·</span>
            <span>📍 {item.address.split(",")[0]}</span>
            {savesCount > 0 && <><span>·</span><span>♡ {savesCount} שמרו</span></>}
          </div>
        )}

        {/* Owner: status toggles */}
        {isOwner && (
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            {(["active","taken","removed"] as const).map(s => {
              const labels = { active:"● פעיל", taken:"✓ נלקח", removed:"✕ הוסר" };
              return (
                <button key={s} onClick={() => updateStatus(s)} style={{
                  padding:"7px 14px", borderRadius:999,
                  background: itemStatus===s ? "var(--ink)" : "var(--paper-2)",
                  color: itemStatus===s ? "var(--paper)" : "var(--muted)",
                  border:"1.5px solid var(--ink)",
                  fontFamily:"var(--font-sans)", fontSize:12, fontWeight:700, cursor:"pointer",
                }}>{labels[s]}</button>
              );
            })}
          </div>
        )}

        {/* Divider */}
        <div style={{ height:1.5, background:"var(--line-strong)", marginBottom:14 }}/>

        {/* Description */}
        {item.description && (
          <div style={{ fontSize:14, lineHeight:1.6, color:"var(--ink-soft)", marginBottom:14 }}>
            {item.description}
          </div>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
            {item.tags.map(t => (
              <span key={t} style={{ padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:700, background:"var(--surface)", border:"1.5px solid var(--ink)" }}>#{t}</span>
            ))}
          </div>
        )}

        {/* Location */}
        <div style={{ padding:"10px 14px", background:"var(--surface)", border:"2px solid var(--ink)", borderRadius:14, boxShadow:"var(--sh-sm)", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>📍</span>
          <div>
            <div style={{ fontWeight:700, fontSize:14 }}>{item.address}</div>
            {clearanceDay && (
              <div style={{ fontSize:12, color:"var(--muted)", fontWeight:500, marginTop:2 }}>🚛 פינוי עירוני: {clearanceDay}</div>
            )}
          </div>
        </div>

        {/* Reporter card (non-owner only) */}
        {!isOwner && reporter && (
          <div style={{ marginTop:12, padding:"12px 14px", background:"var(--primary-tint)", border:"2px solid var(--ink)", borderRadius:14, boxShadow:"var(--sh-sm)", display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", flexShrink:0, background: reporter.avatar_color ?? "var(--warning-tint)", border:"2px solid var(--ink)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-display)", fontWeight:900, fontSize:18 }}>{initials}</div>
            <div>
              <div style={{ fontWeight:800, fontSize:13 }}>{reporter.name ?? "GreenHOODer"}</div>
              <div style={{ fontSize:11, color:"var(--muted)", fontWeight:500 }}>🏆 {Math.floor((reporter.xp ?? 0)/100)+1} רמה · {reporter.xp ?? 0} XP</div>
            </div>
            <div style={{ marginRight:"auto", fontSize:11, color:"var(--muted)", fontWeight:600 }}>דיווח</div>
          </div>
        )}

        {/* Photos (non-owner, tap to lightbox) */}
        {!isOwner && images.length > 0 && primaryImg && (
          <div style={{ marginTop:12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={primaryImg.url} alt="" onClick={() => setLightboxUrl(primaryImg.url)}
              style={{ width:"100%", borderRadius:14, border:"2px solid var(--ink)", cursor:"zoom-in", objectFit:"cover", maxHeight:200 }} />
          </div>
        )}
      </div>

      {/* ── Bottom bar ── */}
      {!taken && !removed && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"14px 16px calc(14px + env(safe-area-inset-bottom))", background:"var(--surface)", borderTop:"2px solid var(--ink)", display:"flex", gap:10, zIndex:20 }}>
          {isOwner ? (
            <>
              <button onClick={() => updateStatus("taken")} style={{
                flex:1, height:56,
                background:"var(--primary)", color:"var(--ink)",
                border:"2px solid var(--ink)", borderRadius:"var(--r-md)",
                fontFamily:"var(--font-sans)", fontWeight:700, fontSize:17,
                cursor:"pointer", boxShadow:"var(--sh-md)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={2.2} strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                סמן כנלקח
              </button>
              <button onClick={deleteItem} disabled={deleting} style={{ width:56, height:56, flexShrink:0, background:"var(--surface)", border:"2px solid var(--ink)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", padding:0, boxShadow:"var(--sh-md)" }}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.75} strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </>
          ) : (
            <>
              <button onClick={handleNavigate} disabled={navigating} style={{
                flex:1, height:56,
                background: navigating ? "var(--primary-tint)" : "var(--primary)",
                color:"var(--ink)", border:"2px solid var(--ink)", borderRadius:"var(--r-md)",
                fontFamily:"var(--font-sans)", fontWeight:700, fontSize:17,
                cursor: navigating ? "not-allowed" : "pointer",
                boxShadow:"var(--sh-md)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                opacity: navigating ? 0.55 : 1, transition:"opacity 200ms",
              }}>
                {navigating ? "🔍 מאתר…" : (
                  <>
                    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round">
                      <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                    </svg>
                    נווט אליי
                  </>
                )}
              </button>
              <button onClick={() => router.push(`/chat/${id}`)} style={{ width:56, height:56, flexShrink:0, background:"var(--surface)", border:"2px solid var(--ink)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", padding:0, boxShadow:"var(--sh-md)" }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
