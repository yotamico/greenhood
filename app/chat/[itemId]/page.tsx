"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}
interface Profile {
  id: string;
  name: string | null;
  avatar_color: string | null;
}
interface Item {
  id: string;
  title: string;
  reporter_id: string;
}

async function registerPush(userId: string) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
    });

    await supabase.from("push_subscriptions").upsert(
      { user_id: userId, endpoint: sub.endpoint, subscription: sub.toJSON() },
      { onConflict: "user_id,endpoint" }
    );
  } catch { /* permission denied or unsupported */ }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default function ChatPage() {
  const router   = useRouter();
  const params   = useParams();
  const itemId   = params.itemId as string;

  const [messages,  setMessages]  = useState<Message[]>([]);
  const [item,      setItem]      = useState<Item | null>(null);
  const [userId,    setUserId]    = useState<string | null>(null);
  const [input,     setInput]     = useState("");
  const [sending,   setSending]   = useState(false);
  const [loading,   setLoading]   = useState(true);

  const profilesRef = useRef<Map<string, Profile>>(new Map());
  const [profiles,  setProfiles]  = useState<Map<string, Profile>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);

  const addProfile = useCallback((p: Profile) => {
    profilesRef.current = new Map(profilesRef.current).set(p.id, p);
    setProfiles(new Map(profilesRef.current));
  }, []);

  async function markRead(uid: string) {
    await supabase.from("message_reads").upsert(
      { user_id: uid, item_id: itemId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,item_id" }
    );
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      setUserId(session.user.id);

      const [{ data: it }, { data: msgs }] = await Promise.all([
        supabase.from("items").select("id,title,reporter_id").eq("id", itemId).single(),
        supabase.from("messages").select("*").eq("item_id", itemId).order("created_at"),
      ]);

      if (it) setItem(it as Item);
      const msgList = (msgs ?? []) as Message[];
      setMessages(msgList);

      const ids = [...new Set(msgList.map(m => m.sender_id))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles")
          .select("id,name,avatar_color").in("id", ids);
        (profs ?? []).forEach((p) => addProfile(p as Profile));
      }

      await markRead(session.user.id);
      registerPush(session.user.id);
      setLoading(false);
    }
    init();
  }, [itemId, router, addProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${itemId}`)
      .on("postgres_changes", {
        event:  "INSERT",
        schema: "public",
        table:  "messages",
        filter: `item_id=eq.${itemId}`,
      }, async (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => [...prev, msg]);
        if (!profilesRef.current.has(msg.sender_id)) {
          const { data: p } = await supabase.from("profiles")
            .select("id,name,avatar_color").eq("id", msg.sender_id).single();
          if (p) addProfile(p as Profile);
        }
        if (userId) markRead(userId);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [itemId, addProfile, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || !userId || sending) return;
    setSending(true);
    const content = input.trim();
    setInput("");
    await supabase.from("messages").insert([{ item_id: itemId, sender_id: userId, content }]);

    // Trigger push notification to item reporter
    fetch("/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, sender_id: userId, content, item_title: item?.title }),
    }).catch(() => {});

    setSending(false);
  }

  if (loading) return (
    <div style={{
      minHeight:"100dvh", background:"var(--paper)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"var(--font-sans)",
    }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
        <div style={{ color:"var(--muted)", fontWeight:600 }}>טוען…</div>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight:"100dvh", display:"flex", flexDirection:"column",
      background:"var(--paper)", fontFamily:"var(--font-sans)",
    }}>
      {/* ── Header ── */}
      <div style={{
        position:"sticky", top:0, zIndex:20,
        padding:"12px 16px",
        background:"rgba(245,242,232,0.96)", backdropFilter:"blur(8px)",
        borderBottom:"1.5px solid var(--ink)",
        display:"flex", alignItems:"center", gap:12,
      }}>
        <button onClick={() => router.back()} style={{
          width:38, height:38, borderRadius:"50%",
          background:"var(--surface)", border:"2px solid var(--ink)",
          display:"flex", alignItems:"center", justifyContent:"center",
          cursor:"pointer", padding:0, boxShadow:"var(--sh-sm)", flexShrink:0,
        }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M15 18l6-6-6-6"/>
          </svg>
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{
            fontFamily:"var(--font-display)", fontWeight:900, fontSize:16,
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
          }}>
            💬 {item?.title ?? "…"}
          </div>
          <div style={{ fontSize:11, color:"var(--muted)", fontWeight:500 }}>שיחה על הפריט</div>
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{
        flex:1, overflowY:"auto",
        padding:"16px 16px 90px",
        display:"flex", flexDirection:"column", gap:12,
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign:"center", padding:"60px 20px",
            color:"var(--muted)", fontWeight:500, fontSize:14,
          }}>
            <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
            אין הודעות עדיין — שלח/י ראשון/ה!
          </div>
        )}

        {messages.map(msg => {
          const isMe = msg.sender_id === userId;
          const prof = profiles.get(msg.sender_id);
          const initial = (prof?.name ?? "?").charAt(0).toUpperCase();
          const time = new Date(msg.created_at).toLocaleTimeString("he-IL", {
            hour:"2-digit", minute:"2-digit",
          });

          return (
            <div key={msg.id} style={{
              display:"flex",
              flexDirection: isMe ? "row-reverse" : "row",
              alignItems:"flex-end", gap:8,
            }}>
              {!isMe && (
                <div style={{
                  width:32, height:32, borderRadius:"50%", flexShrink:0,
                  background: prof?.avatar_color ?? "var(--warning-tint)",
                  border:"1.5px solid var(--ink)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:"var(--font-display)", fontWeight:900, fontSize:14,
                }}>{initial}</div>
              )}
              <div style={{ maxWidth:"72%", display:"flex", flexDirection:"column",
                alignItems: isMe ? "flex-end" : "flex-start", gap:3 }}>
                <div style={{
                  padding:"10px 14px",
                  background: isMe ? "var(--ink)" : "var(--surface)",
                  color: isMe ? "var(--paper)" : "var(--ink)",
                  border:"1.5px solid var(--ink)",
                  borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  boxShadow:"var(--sh-sm)",
                  fontSize:14, fontWeight:500, lineHeight:1.5,
                  direction:"rtl",
                }}>{msg.content}</div>
                <div style={{ fontSize:10, color:"var(--muted)", fontWeight:500, paddingInline:4 }}>
                  {time}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0,
        padding:"10px 16px calc(10px + env(safe-area-inset-bottom))",
        background:"var(--paper)", borderTop:"2px solid var(--ink)",
        display:"flex", gap:10, alignItems:"flex-end",
        zIndex:20,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="כתוב/י הודעה…"
          rows={1}
          style={{
            flex:1, padding:"10px 14px",
            background:"var(--surface)",
            border:"2px solid var(--ink)", borderRadius:14,
            fontFamily:"var(--font-sans)", fontSize:15, color:"var(--ink)",
            outline:"none", resize:"none", lineHeight:1.5, direction:"rtl",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          style={{
            width:48, height:48, flexShrink:0,
            background: input.trim() ? "var(--primary)" : "var(--paper-2)",
            border:"2px solid var(--ink)", borderRadius:14,
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor: input.trim() ? "pointer" : "default",
            boxShadow:"var(--sh-sm)", transition:"background 150ms",
          }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
            stroke="var(--ink)" strokeWidth={2} strokeLinecap="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
