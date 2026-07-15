"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { TabBar } from "@/components/ui/TabBar";

const CAT_EMOJI: Record<string,string> = {
  furniture:"🪑",books:"📚",lighting:"💡",plants:"🌿",
  sports:"⚽",electronics:"📺",kitchen:"🍳",kids:"🧸",
};
const CAT_COLOR: Record<string,string> = {
  furniture:"var(--warning-tint)",books:"var(--info-tint)",
  lighting:"var(--accent-tint)",plants:"var(--primary-light)",
  sports:"var(--info-tint)",electronics:"var(--paper-2)",
  kitchen:"var(--warning-tint)",kids:"var(--accent-tint)",
};

const FILTERS = [
  { key:"all",   label:"הכל" },
  { key:"saved", label:"saved" },   // heart icon rendered separately
  { key:"urgent",label:"🔥 פינוי קרוב" },
  { key:"furniture",label:"ריהוט" },
  { key:"books", label:"ספרים" },
  { key:"plants",label:"צמחים" },
  { key:"kids",  label:"ילדים" },
];

interface Item {
  id:string; title:string; category:string; condition:string;
  address:string; created_at:string; pickup_day:string|null;
  status:string; taken_at:string|null;
  item_images: { url:string; is_primary:boolean }[];
}

const HEBREW_DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const APPEAL_WINDOW_MS = 3 * 60 * 60 * 1000;

function isDisplayEligible(it: Pick<Item, "status" | "pickup_day" | "taken_at">, todayStr: string): boolean {
  if (it.status === "active") return it.pickup_day === null || it.pickup_day >= todayStr;
  if (it.status === "taken")  return !!it.taken_at && Date.now() - new Date(it.taken_at).getTime() < APPEAL_WINDOW_MS;
  return false;
}

export default function FeedPage() {
  const router  = useRouter();
  const [items, setItems]   = useState<Item[]>([]);
  const [filter,setFilter]  = useState("all");
  const [saved, setSaved]   = useState<Set<string>>(new Set());
  const [search,setSearch]  = useState("");
  const [authed,setAuthed]  = useState(false);
  const [userId,setUserId]  = useState<string|null>(null);
  const [scheduleData, setScheduleData] = useState<{street_name:string; collection_day:string; city:string}[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{session}}) => {
      if (!session) { router.replace("/login"); return; }
      setUserId(session.user.id);
      setAuthed(true);
    });
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    supabase.from("saved_items").select("item_id").eq("user_id", userId)
      .then(({ data }) => setSaved(new Set((data ?? []).map(r => r.item_id as string))));
  }, [userId]);

  useEffect(() => {
    // city_sync_sources is service-role-only (no RLS policy for the client), so we can't ask it
    // which cities are "active" from here — instead just fetch every street_schedules row.
    // The table only holds real municipal data (a few hundred rows across all cities today),
    // so an unfiltered fetch is cheap and always reflects whichever cities actually have data.
    fetchAllPages<{street_name:string;collection_day:string;city:string}>((from, to) =>
      supabase.from("street_schedules").select("street_name,collection_day,city").range(from, to)
    ).then(setScheduleData);
  }, []);

  useEffect(() => {
    if (!authed) return;
    supabase.from("items")
      .select("id,title,category,condition,address,created_at,pickup_day,status,taken_at,item_images(url,is_primary)")
      .in("status",["active","taken"])
      .eq("moderation_status","approved")
      .order("created_at",{ascending:false})
      .limit(60)
      .then(({ data }) => {
        const todayStr = new Date().toISOString().split("T")[0];
        setItems(((data as Item[]) ?? []).filter(it => isDisplayEligible(it, todayStr)));
      });
  }, [authed]);

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split("T")[0];

  const tomorrowHebrewDay = HEBREW_DAYS[(new Date().getDay() + 1) % 7];
  const tomorrowSchedule = scheduleData.filter(s => s.collection_day === tomorrowHebrewDay);

  const displayed = items.filter(it => {
    if (filter === "saved")  return saved.has(it.id);
    if (filter === "urgent") return it.pickup_day === today || it.pickup_day === tomorrow;
    if (filter !== "all")    return it.category === filter;
    return true;
  }).filter(it =>
    !search || it.title.includes(search) || it.address.includes(search)
  );

  /* split into 2 columns for masonry */
  const col1 = displayed.filter((_,i) => i % 2 === 0);
  const col2 = displayed.filter((_,i) => i % 2 === 1);

  async function toggleSave(id:string) {
    if (!userId) return;
    const isSaved = saved.has(id);
    if (isSaved) await supabase.from("saved_items").delete().eq("user_id", userId).eq("item_id", id);
    else         await supabase.from("saved_items").insert({ user_id: userId, item_id: id });
    setSaved(s => { const n = new Set(s); isSaved ? n.delete(id) : n.add(id); return n; });
  }

  if (!authed) return null;

  return (
    <div style={{
      minHeight:"100dvh", background:"var(--paper)",
      fontFamily:"var(--font-sans)", paddingBottom:80,
    }}>
      {/* header */}
      <div style={{
        padding:"8px 20px 0",
        borderBottom:"2px solid var(--ink)",
        background:"var(--paper)",
        position:"sticky", top:0, zIndex:20,
      }}>
        <div style={{
          display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:12,
        }}>
          <div style={{
            fontFamily:"var(--font-display)", fontWeight:900,
            fontSize:36, letterSpacing:"-0.02em",
          }}>פיד</div>
          <div style={{
            width:44, height:44,
            background:"var(--surface)",
            border:"2px solid var(--ink)", borderRadius:"var(--r-md)",
            boxShadow:"var(--sh-md)",
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer",
          }} onClick={() => setSearch(s => s)}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <circle cx={11} cy={11} r={6}/><path d="M20 20l-4.5-4.5"/>
            </svg>
          </div>
        </div>

        {/* filter chips */}
        <div style={{
          display:"flex", gap:8, paddingBottom:12,
          overflowX:"auto", scrollbarWidth:"none",
        }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding:"7px 14px", height:34,
              background: filter===f.key ? "var(--ink)" : "var(--surface)",
              color: filter===f.key ? "var(--paper)" : "var(--ink)",
              border:"1.5px solid var(--ink)", borderRadius:999,
              fontFamily:"var(--font-sans)", fontWeight:700, fontSize:13,
              cursor:"pointer", flexShrink:0, whiteSpace:"nowrap",
              boxShadow: filter===f.key ? "2px 2px 0 var(--shadow-ink)" : "1px 1px 0 var(--shadow-ink)",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* masonry grid */}
      {displayed.length === 0 ? (
        <div style={{
          padding:"60px 20px", textAlign:"center",
          display:"flex", flexDirection:"column", alignItems:"center", gap:12,
        }}>
          <div style={{fontSize:48}}>🌱</div>
          <div style={{
            fontFamily:"var(--font-display)", fontWeight:900, fontSize:22,
          }}>אין פריטים עדיין</div>
          <div style={{fontSize:14,color:"var(--muted)",fontWeight:500}}>
            היה/י הראשון/ה לדווח!
          </div>
        </div>
      ) : (
        <div style={{
          display:"grid", gridTemplateColumns:"1fr 1fr",
          gap:12, padding:"16px 12px 20px",
        }}>
          {/* column 1 */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {col1.map(it => (
              <MasonryCard key={it.id} item={it} saved={saved.has(it.id)} onSave={toggleSave} onPress={() => router.push(`/items/${it.id}`)} today={today} tomorrow={tomorrow} tomorrowSchedule={tomorrowSchedule}/>
            ))}
          </div>
          {/* column 2 */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {col2.map(it => (
              <MasonryCard key={it.id} item={it} saved={saved.has(it.id)} onSave={toggleSave} onPress={() => router.push(`/items/${it.id}`)} today={today} tomorrow={tomorrow} tomorrowSchedule={tomorrowSchedule}/>
            ))}
          </div>
        </div>
      )}

      <TabBar />
    </div>
  );
}

function MasonryCard({ item, saved, onSave, onPress, today, tomorrow, tomorrowSchedule }:{
  item:Item; saved:boolean; onSave:(id:string)=>void; onPress:()=>void;
  today:string; tomorrow:string; tomorrowSchedule:{street_name:string; city:string}[];
}) {
  const emoji    = CAT_EMOJI[item.category] ?? "📦";
  const color    = CAT_COLOR[item.category] ?? "var(--paper-2)";
  const urgent   = item.pickup_day === today || item.pickup_day === tomorrow;
  const isTaken  = item.status === "taken";
  const norm     = (s:string) => s.replace(/['"״"]/g,"");
  // Prefer a city+street match (avoids two cities sharing a street name); fall back to
  // street-only if the item's free-text address doesn't spell out a city.
  const addr = norm(item.address);
  const cityAndStreetMatches = tomorrowSchedule.filter(s => addr.includes(norm(s.city)) && addr.includes(norm(s.street_name)));
  const streetOnlyMatches = tomorrowSchedule.filter(s => addr.includes(norm(s.street_name)));
  const clearanceTomorrow = (cityAndStreetMatches.length > 0 || streetOnlyMatches.length > 0);
  const photoUrl = item.item_images?.find(img => img.is_primary)?.url
                ?? item.item_images?.[0]?.url
                ?? null;
  /* deterministic but varied card image height — 3 distinct sizes based on item id */
  const seed = item.id.charCodeAt(0) + item.id.charCodeAt(2) + item.id.charCodeAt(4);
  const h = [120, 168, 212][seed % 3];

  return (
    <div onClick={onPress} style={{
      background:"var(--surface)",
      border:"2px solid var(--ink)", borderRadius:16,
      boxShadow:"var(--sh-md)",
      overflow:"hidden", cursor:"pointer",
    }}>
      {/* image area */}
      <div style={{
        height:h, background: photoUrl ? "var(--paper-2)" : color,
        borderBottom:"2px solid var(--ink)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:h*0.38, position:"relative", overflow:"hidden",
      }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.title} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
        ) : emoji}
        {isTaken ? (
          <div style={{
            position:"absolute", top:8, right:8,
            padding:"2px 8px", borderRadius:999,
            background:"var(--paper-2)", color:"var(--muted)",
            border:"1.5px solid var(--ink)",
            fontSize:10, fontWeight:800,
          }}>⏳ נלקח</div>
        ) : (clearanceTomorrow || urgent) && (
          <div style={{
            position:"absolute", top:8, right:8,
            padding:"2px 8px", borderRadius:999,
            background:"var(--accent)", color:"white",
            border:"1.5px solid var(--ink)",
            fontSize:10, fontWeight:800,
          }}>🔥 {clearanceTomorrow ? "מחר" : "מהר!"}</div>
        )}
        <button
          onClick={e => { e.stopPropagation(); onSave(item.id); }}
          style={{
            position:"absolute", top:8, left:8,
            width:32, height:32, borderRadius:"50%",
            background:"var(--surface)", border:"2px solid var(--ink)",
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", padding:0,
            boxShadow:"1.5px 1.5px 0 var(--shadow-ink)",
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill={saved ? "var(--accent)" : "none"}
            stroke={saved ? "var(--accent)" : "currentColor"} strokeWidth={1.8} strokeLinecap="round">
            <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>
          </svg>
        </button>
      </div>

      {/* info */}
      <div style={{padding:"10px 10px 12px"}}>
        <div style={{
          fontFamily:"var(--font-display)", fontWeight:900,
          fontSize:14, lineHeight:1.2, color:"var(--ink)",
        }}>{item.title}</div>
        <div style={{
          display:"flex", justifyContent:"space-between",
          alignItems:"center", marginTop:6,
        }}>
          <span style={{fontSize:11,color:"var(--muted)",fontWeight:500}}>
            📍 {item.address.split(",")[0]}
          </span>
        </div>
      </div>
    </div>
  );
}
