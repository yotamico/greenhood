"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { TabBar } from "@/components/ui/TabBar";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";

interface Profile {
  name: string;
  avatar_color: string;
  personas: string[];
  xp: number;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user,    setUser]    = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myItems, setMyItems] = useState<{ id:string; title:string; status:string }[]>([]);
  const [unreadItems, setUnreadItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      setUser(session.user);

      const { data: p } = await supabase.from("profiles")
        .select("name,avatar_color,personas,xp,created_at")
        .eq("id", session.user.id)
        .single();
      if (p) setProfile(p as Profile);

      const { data: items } = await supabase.from("items")
        .select("id,title,status")
        .eq("reporter_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      const itemList = items ?? [];
      setMyItems(itemList);

      // Check unread messages for each item
      if (itemList.length) {
        const uid = session.user.id;
        const ids = itemList.map(i => i.id);
        const { data: reads } = await supabase
          .from("message_reads").select("item_id,last_read_at").eq("user_id", uid).in("item_id", ids);
        const readMap = new Map((reads ?? []).map(r => [r.item_id, r.last_read_at]));

        const unread = new Set<string>();
        await Promise.all(ids.map(async (itemId) => {
          const lastRead = readMap.get(itemId) ?? "1970-01-01T00:00:00Z";
          const { count } = await supabase
            .from("messages").select("*", { count: "exact", head: true })
            .eq("item_id", itemId).gt("created_at", lastRead).neq("sender_id", uid);
          if ((count ?? 0) > 0) unread.add(itemId);
        }));
        setUnreadItems(unread);
      }
    });
  }, [router]);

  if (!user) return null;

  const initials = (profile?.name || user.email || "?").charAt(0).toUpperCase();
  const xp = profile?.xp ?? 0;
  const level = Math.floor(xp / 100) + 1;
  const xpToNext = 100 - (xp % 100);
  const reported = myItems.length;
  const taken = myItems.filter(i => i.status === "taken").length;

  const ACHIEVEMENTS = [
    { id: "first",   emoji: "🥇", label: "ראשון בשכונה",  color: "#C8A021", unlocked: reported >= 1  },
    { id: "nature",  emoji: "♻️", label: "יד הטבע",       color: "#6B9956", unlocked: reported >= 5  },
    { id: "fire",    emoji: "🔥", label: "שבוע רצוף",     color: "#E55A2B", unlocked: reported >= 7  },
    { id: "camera",  emoji: "📸", label: "צלם מקצוע",     color: "#5B8DB8", unlocked: reported >= 10 },
    { id: "hunter",  emoji: "🎯", label: "ציידת מציאות",   color: "#C97464", unlocked: taken >= 1     },
    { id: "veteran", emoji: "⭐", label: "ותיק שכונה",    color: "#9B59B6", unlocked: level >= 5     },
    { id: "social",  emoji: "💬", label: "חברותי",         color: "#3498DB", unlocked: reported >= 3  },
    { id: "impact",  emoji: "🌱", label: "שומר הסביבה",   color: "#27AE60", unlocked: reported >= 15 },
  ];
  const unlockedCount = ACHIEVEMENTS.filter(a => a.unlocked).length;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div style={{
      minHeight:"100dvh", background:"var(--paper)",
      fontFamily:"var(--font-sans)", paddingBottom:80,
    }}>
      {/* header */}
      <div style={{
        padding:"20px 20px 24px",
        background:"var(--primary-tint)",
        borderBottom:"2px solid var(--ink)",
      }}>
        <div style={{
          display:"flex", justifyContent:"space-between", alignItems:"start",
        }}>
          <div style={{ display:"flex", gap:14, alignItems:"center" }}>
            {/* avatar */}
            <div style={{
              width:64, height:64, borderRadius:"50%",
              background: profile?.avatar_color ?? "var(--warning-tint)",
              border:"2px solid var(--ink)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontFamily:"var(--font-display)", fontWeight:900, fontSize:28,
            }}>{initials}</div>
            <div>
              <div style={{
                fontFamily:"var(--font-display)", fontWeight:900,
                fontSize:22, letterSpacing:"-0.01em",
              }}>{profile?.name || user.email?.split("@")[0]}</div>
              <div style={{
                display:"inline-flex", alignItems:"center", gap:6,
                padding:"3px 10px", borderRadius:999,
                background:"var(--ink)", color:"var(--paper)",
                fontSize:11, fontWeight:800, marginTop:6,
              }}>
                🏆 רמה {level} · GreenHOODer
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              background:"var(--surface)", border:"1.5px solid var(--ink)",
              borderRadius:"var(--r-sm)", padding:"6px 12px",
              fontSize:12, fontWeight:700, cursor:"pointer",
              fontFamily:"var(--font-sans)",
              boxShadow:"var(--sh-sm)",
            }}
          >יציאה</button>
        </div>

        {/* XP bar */}
        <div style={{ marginTop:18 }}>
          <div style={{
            display:"flex", justifyContent:"space-between",
            fontSize:11, fontWeight:700, marginBottom:5,
          }}>
            <span>
              <strong style={{ fontFamily:"var(--font-display)", fontSize:16 }}>
                {xp}
              </strong> XP
            </span>
            <span style={{ color:"var(--muted)" }}>
              עוד {xpToNext} לרמה {level+1} →
            </span>
          </div>
          <div style={{
            height:14, background:"var(--surface)",
            border:"2px solid var(--ink)", borderRadius:999,
            boxShadow:"var(--sh-sm)", overflow:"hidden",
          }}>
            <div style={{
              width:`${xp % 100}%`,
              height:"100%",
              background:"var(--primary)",
              minWidth:4,
              backgroundImage:`repeating-linear-gradient(135deg,transparent 0 6px,rgba(255,255,255,0.2) 6px 8px)`,
            }}/>
          </div>
        </div>
      </div>

      {/* stats */}
      <div style={{
        display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
        gap:10, padding:"16px 16px 8px",
      }}>
        <StatCard value={reported} label="דיווחים" emoji="♻️"/>
        <StatCard value={taken}    label="הועברו"  emoji="🎯"/>
        <StatCard value={level}    label="רמה"     emoji="⭐"/>
      </div>

      {/* impact banner */}
      <div style={{ padding:"8px 16px" }}>
        <div style={{
          background:"var(--ink)", color:"var(--paper)",
          borderRadius:18, padding:18,
          border:"2px solid var(--ink)",
          boxShadow:"4px 4px 0 var(--primary-light)",
        }}>
          <div style={{
            fontSize:10, fontWeight:800, letterSpacing:"0.08em",
            textTransform:"uppercase", color:"var(--primary-light)",
            marginBottom:8,
          }}>⟢ ההשפעה שלי</div>
          <div style={{
            fontFamily:"var(--font-display)", fontWeight:900,
            fontSize:32, lineHeight:1, marginBottom:4,
          }}>
            {reported * 8} <span style={{ color:"var(--primary-light)", fontSize:16 }}>ק"ג נחסכו מהטמנה</span>
          </div>
          <div style={{fontSize:12,color:"var(--muted-2)",fontWeight:500}}>
            הערכה: 8 ק"ג CO₂ לכל פריט
          </div>
        </div>
      </div>

      {/* achievements */}
      <div style={{ padding:"8px 16px 4px" }}>
        <div style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:12,
        }}>
          <div style={{
            fontFamily:"var(--font-display)", fontWeight:900, fontSize:20,
          }}>הישגים</div>
          <div style={{ fontSize:12, color:"var(--muted)", fontWeight:600 }}>
            {unlockedCount} מתוך {ACHIEVEMENTS.length} —
          </div>
        </div>
        <div style={{
          display:"flex", gap:10,
          overflowX:"auto", paddingBottom:6,
          scrollbarWidth:"none",
        }}>
          {ACHIEVEMENTS.map(a => (
            <div key={a.id} style={{
              flexShrink:0, width:78,
              display:"flex", flexDirection:"column", alignItems:"center", gap:6,
              padding:"12px 6px 10px",
              background: a.unlocked ? a.color + "22" : "var(--paper-2)",
              border:`2px solid ${a.unlocked ? a.color : "var(--border)"}`,
              borderRadius:16, boxShadow: a.unlocked ? "var(--sh-sm)" : "none",
            }}>
              <div style={{
                fontSize:28,
                filter: a.unlocked ? "none" : "grayscale(1)",
                opacity: a.unlocked ? 1 : 0.35,
              }}>{a.emoji}</div>
              <div style={{
                fontSize:10, fontWeight:700, textAlign:"center",
                color: a.unlocked ? "var(--ink)" : "var(--muted)",
                lineHeight:1.3,
              }}>{a.label}</div>
              {!a.unlocked && (
                <div style={{ fontSize:11, opacity:0.5 }}>🔒</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* my items */}
      <div style={{ padding:"16px 20px 8px" }}>
        <div style={{
          fontFamily:"var(--font-display)", fontWeight:900,
          fontSize:20, marginBottom:12,
        }}>הפריטים שלי</div>

        {myItems.length === 0 ? (
          <div style={{
            padding:"24px", textAlign:"center",
            background:"var(--surface)", border:"2px solid var(--ink)",
            borderRadius:14, boxShadow:"var(--sh-md)",
          }}>
            <div style={{fontSize:32,marginBottom:8}}>🌱</div>
            <div style={{fontWeight:700,marginBottom:4}}>עדיין לא דיווחת על פריטים</div>
            <div style={{fontSize:13,color:"var(--muted)",fontWeight:500}}>
              לחץ + במפה כדי להתחיל
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {myItems.map(it => {
              const hasUnread = unreadItems.has(it.id);
              return (
                <Link key={it.id} href={`/items/${it.id}`} style={{ textDecoration:"none" }}>
                  <div style={{
                    padding:"12px 14px",
                    background: hasUnread ? "var(--primary-tint)" : "var(--surface)",
                    border: hasUnread ? "2px solid var(--primary)" : "2px solid var(--ink)",
                    borderRadius:12, boxShadow:"var(--sh-sm)",
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    cursor:"pointer",
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {hasUnread && (
                        <div style={{
                          width:9, height:9, borderRadius:"50%",
                          background:"#E53E3E", flexShrink:0,
                          boxShadow:"0 0 0 2px var(--primary-tint)",
                        }}/>
                      )}
                      <div style={{ fontWeight:700, fontSize:14, color:"var(--ink)" }}>{it.title}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      {hasUnread && (
                        <span style={{
                          padding:"2px 8px", borderRadius:999, fontSize:10, fontWeight:800,
                          background:"#E53E3E", color:"#fff", border:"1.5px solid var(--ink)",
                        }}>הודעה חדשה 💬</span>
                      )}
                      <span style={{
                        padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:800,
                        background: it.status==="taken" ? "var(--primary-tint)" : "var(--warning-tint)",
                        border:"1.5px solid var(--ink)",
                      }}>
                        {it.status==="taken" ? "✅ נלקח" : "🟡 פעיל"}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <TabBar />
    </div>
  );
}

function StatCard({ value, label, emoji }: { value:number; label:string; emoji:string }) {
  return (
    <div style={{
      background:"var(--surface)",
      border:"2px solid var(--ink)", borderRadius:14,
      boxShadow:"var(--sh-md)",
      padding:"12px 8px",
      display:"flex", flexDirection:"column", alignItems:"center", gap:4,
    }}>
      <div style={{fontSize:20}}>{emoji}</div>
      <div style={{
        fontFamily:"var(--font-display)", fontWeight:900, fontSize:24, lineHeight:1,
      }}>{value}</div>
      <div style={{fontSize:11,color:"var(--muted)",fontWeight:600}}>{label}</div>
    </div>
  );
}
