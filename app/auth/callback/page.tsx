"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/");
    });

    // If session already exists (race with the event), redirect immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/");
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div style={{
      minHeight: "100dvh", background: "#0f1117",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#7880a0", fontFamily: "'Heebo', sans-serif", fontSize: 16,
    }}>
      מתחבר...
    </div>
  );
}
