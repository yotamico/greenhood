import { supabase } from "@/lib/supabase";

// Client side of the sponsored-ads feature. Schema + RPCs: supabase_ads.sql.
// The app never reads the ad tables directly — only ads_pick / ads_log_event.

export type AdPlacement = "item" | "collected" | "report" | "me";
export type AdEvent = "impression" | "click" | "dismiss";

export interface PickedAd {
  campaign_id: string;
  advertiser_name: string;
  headline: string;
  body: string | null;
  image_url: string | null;
  cta_type: "call" | "whatsapp" | "website" | "navigate";
  cta_value: string | null;
  business_address: string | null;
  business_lat: number | null;
  business_lng: number | null;
  distance_km: number | null;
  item_id: string | null;
  item_title: string | null;
  matched_keyword: string | null;
  match_reason: "keyword" | "category" | "general";
}

export async function pickAds(placement: AdPlacement, itemId?: string | null, limit = 1): Promise<PickedAd[]> {
  const { data, error } = await supabase.rpc("ads_pick" as never, {
    p_placement: placement, p_item_id: itemId ?? null, p_limit: limit,
  } as never);
  if (error) { console.warn("[ads_pick]", error.message); return []; }
  return (data ?? []) as PickedAd[];
}

export function logAdEvent(ad: PickedAd, event: AdEvent, placement: AdPlacement) {
  // Fire-and-forget: ad telemetry must never block or break the page.
  supabase.rpc("ads_log_event" as never, {
    p_campaign_id: ad.campaign_id, p_event: event, p_placement: placement,
    p_item_id: ad.item_id, p_keyword: ad.matched_keyword,
  } as never).then(({ error }) => { if (error) console.warn("[ads_log_event]", error.message); });
}

export async function getAdsPersonalized(userId: string): Promise<boolean> {
  const { data } = await supabase.from("ad_preferences").select("personalized").eq("user_id", userId).maybeSingle();
  return data?.personalized ?? true;
}

export async function setAdsPersonalized(userId: string, personalized: boolean) {
  return supabase.from("ad_preferences").upsert({ user_id: userId, personalized, updated_at: new Date().toISOString() });
}

function israeliPhoneE164(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return d;
}

export function adCtaHref(ad: PickedAd): string | null {
  const v = ad.cta_value?.trim() ?? "";
  switch (ad.cta_type) {
    case "call":     return v ? `tel:${v.replace(/[^\d+]/g, "")}` : null;
    case "whatsapp": return v ? `https://wa.me/${israeliPhoneE164(v)}` : null;
    case "website":  return /^https?:\/\//.test(v) ? v : null;
    case "navigate": {
      if (ad.business_lat == null || ad.business_lng == null) return null;
      let pref: string | null = null;
      try { pref = localStorage.getItem("navAppPref"); } catch { /* private mode */ }
      return pref === "google"
        ? `https://www.google.com/maps/dir/?api=1&destination=${ad.business_lat},${ad.business_lng}`
        : `https://waze.com/ul?ll=${ad.business_lat},${ad.business_lng}&navigate=yes`;
    }
  }
}

export const CTA_BUTTON: Record<PickedAd["cta_type"], string> = {
  navigate: "נווט לחנות", call: "התקשר", whatsapp: "שלח וואטסאפ", website: "לאתר",
};
