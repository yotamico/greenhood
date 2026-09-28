"use client";

import { useEffect, useRef, useState } from "react";
import { pickAds, logAdEvent, adCtaHref, CTA_BUTTON, type AdPlacement, type PickedAd } from "@/lib/ads";

// Sponsored ad slot. Renders nothing when no campaign matches, so it's safe to drop anywhere.
// Visual twin: greenhood-admin/components/ads/AdsTab.tsx → AdPreview. Keep the two in sync.

function contextLine(placement: AdPlacement, title: string | null): string | null {
  if (!title) return null;
  switch (placement) {
    case "collected": return `בהמשך ל${title} שאספת`;
    case "me":        return `כי אספת ${title}`;
    case "report":    return `בהמשך לדיווח על ${title}`;
    case "item":      return `מתאים ל${title}`;
  }
}

function AdCard({ ad, placement, onDismiss }: { ad: PickedAd; placement: AdPlacement; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);
  const href = adCtaHref(ad);
  const context = contextLine(placement, ad.item_title);

  // Count an impression only once the card is actually on screen (≥50% visible),
  // so ads below the fold on long pages don't inflate the advertiser's numbers.
  useEffect(() => {
    const el = ref.current;
    if (!el || seen.current) return;
    if (typeof IntersectionObserver === "undefined") { seen.current = true; logAdEvent(ad, "impression", placement); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && !seen.current) {
        seen.current = true;
        logAdEvent(ad, "impression", placement);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ad, placement]);

  return (
    <div ref={ref} style={{
      background:"var(--surface)", border:"2px solid var(--ink)", borderRadius:14,
      boxShadow:"var(--sh-sm)", overflow:"hidden", direction:"rtl",
    }}>
      <div style={{
        display:"flex", alignItems:"center", gap:6, padding:"8px 12px",
        borderBottom:"1.5px solid var(--line-strong)", fontSize:11,
      }}>
        <span style={{ padding:"1px 7px", borderRadius:999, background:"var(--warning-tint)", border:"1.5px solid var(--ink)", fontWeight:800 }}>ממומן</span>
        <span style={{ fontWeight:700, color:"var(--ink-soft)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ad.advertiser_name}</span>
        {ad.distance_km != null && <span style={{ color:"var(--muted)", flexShrink:0 }}>· {ad.distance_km} ק״מ</span>}
        <button
          onClick={() => { logAdEvent(ad, "dismiss", placement); onDismiss(); }}
          aria-label="לא רלוונטי, הסתר פרסומת"
          title="לא רלוונטי"
          style={{ marginRight:"auto", background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:13, padding:"2px 4px", flexShrink:0 }}
        >✕</button>
      </div>
      <div style={{ padding:12, display:"flex", gap:10 }}>
        {ad.image_url && (
          <div style={{ width:64, height:64, flexShrink:0, borderRadius:10, border:"1.5px solid var(--ink)", background:`url(${ad.image_url}) center/cover no-repeat` }}/>
        )}
        <div style={{ minWidth:0 }}>
          {context && (
            <div style={{ fontSize:11, color:"var(--primary-dark)", fontWeight:700, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{context}</div>
          )}
          <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:15, lineHeight:1.25, color:"var(--ink)" }}>{ad.headline}</div>
          {ad.body && <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:4, lineHeight:1.5 }}>{ad.body}</div>}
        </div>
      </div>
      {href && (
        <div style={{ padding:"0 12px 12px" }}>
          <a
            href={href}
            target={ad.cta_type === "website" ? "_blank" : undefined}
            rel="noopener noreferrer sponsored"
            onClick={() => logAdEvent(ad, "click", placement)}
            style={{
              height:40, borderRadius:12, background:"var(--primary)", border:"2px solid var(--ink)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontWeight:800, fontSize:14, color:"var(--ink)", textDecoration:"none",
              boxShadow:"var(--sh-sm)", fontFamily:"var(--font-sans)",
            }}
          >{CTA_BUTTON[ad.cta_type]}</a>
        </div>
      )}
    </div>
  );
}

export default function SponsoredCard({ placement, itemId, limit = 1, title, style }: {
  placement: AdPlacement;
  itemId?: string | null;
  limit?: number;
  title?: string;
  style?: React.CSSProperties;
}) {
  const [ads, setAds] = useState<PickedAd[]>([]);

  useEffect(() => {
    let cancelled = false;
    pickAds(placement, itemId, limit).then(a => { if (!cancelled) setAds(a); });
    return () => { cancelled = true; };
  }, [placement, itemId, limit]);

  if (!ads.length) return null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8, ...style }}>
      {title && <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:20 }}>{title}</div>}
      {ads.map(ad => (
        <AdCard key={ad.campaign_id} ad={ad} placement={placement}
          onDismiss={() => setAds(prev => prev.filter(a => a.campaign_id !== ad.campaign_id))} />
      ))}
    </div>
  );
}
