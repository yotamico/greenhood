@AGENTS.md

You are the eco-navigation code agent.
Project: https://github.com/yotamico/eco-navigation
Live site: https://eco-navigation.vercel.app
Stack: Next.js 16, Supabase, Vercel, MapLibre GL, TypeScript
Styling: CSS variables + inline styles / style objects (see app/globals.css for design tokens). Tailwind is wired into the build (@import "tailwindcss" in globals.css) but barely used directly — don't reach for Tailwind utility classes, follow the existing inline-style convention.
RTL app — all UI text is Hebrew, `dir="rtl"` throughout.

Your job:
- Add new features to the app
- Fix bugs
- Always check existing code before making changes
- After every change, run: npx next build (or `node <path-to-npm>/node_modules/npm/bin/npm-cli.js run build` if `next`/`npm` aren't on PATH — check with `where node`/`where npm` first, the exact Node location on this machine has moved before)
- If build passes, commit and push to main — Vercel auto-deploys

## Project structure
- app/page.tsx                — root auth gate; redirects to /login, /welcome, or /map
- app/login/page.tsx          — email/password + Google OAuth login/signup
- app/auth/callback/page.tsx  — OAuth callback (PKCE + implicit flow)
- app/welcome/page.tsx        — onboarding wizard (persona select, location permission)
- app/map/page.tsx            — core screen: MapLibre map, nearby items, clearance routes, live OSRM navigation
- app/report/page.tsx         — single-scroll report form (photo → Claude Vision → category/condition → address → save)
- app/feed/page.tsx           — Pinterest-style browse feed of approved items
- app/items/[id]/page.tsx     — item detail (owner vs. visitor views, save/share/navigate/chat)
- app/items/[id]/edit/page.tsx — owner-only edit form
- app/chat/[itemId]/page.tsx  — realtime 1:1 chat per item (Supabase Realtime)
- app/me/page.tsx             — profile: XP/level, badges, my items
- app/admin/page.tsx          — admin dashboard (yotamico@gmail.com only): overview, moderation queue, items, users
- app/api/analyze-image/      — Claude Vision item identification from a photo
- app/api/geocode/            — reverse geocode (lat/lng → address) via Nominatim
- app/api/geocode/search/     — forward geocode / autocomplete (address text → coords) via Nominatim
- app/api/streets/            — bounding-box street fetch via Overpass, edge-cached 24h
- app/api/broadcast-push/     — push notification to nearby users when a new item is reported
- app/api/send-push/          — push notification to the other chat participant on a new message
- components/Map/GHMapLibre.tsx    — the map component actually used by app/map/page.tsx
- components/NotificationsPopup.tsx — push notification opt-in prompt
- components/ui/TabBar.tsx         — bottom tab bar + push subscription registration
- lib/supabase.ts              — Supabase client (+ header-sanitizing fetch patch, see below) and auth helpers
- lib/nes-ziona-streets.ts      — 236 streets with collection_day + takeout_day + lat/lng

Only one map implementation and one report form exist now — if you ever see a second one, it's a stray duplicate left over from a rewrite; delete it, don't maintain both.

## Data model (live in Supabase, not version-controlled as SQL)
- `items` — reporter_id, title, category, condition, tags, address, lat/lng, pickup_day, status (active/taken/removed), moderation_status (pending/approved/rejected), moderation_reason
- `item_images` — item_id, url, position, is_primary
- `profiles` — id, name, avatar_color, personas, xp, onboarded
- `messages`, `message_reads` — chat
- `saved_items` — per-user saved items
- `ai_suggestions` — Claude Vision suggestion telemetry
- `push_subscriptions` — user_id, endpoint, subscription (jsonb), lat, lng; RPC `get_push_subscriptions_nearby(lat,lng,radius_km)` and `increment_xp`
- `clearance_schedule` — street_name, clearance_day

New items land as `moderation_status: pending` and only show on the map/feed once approved via the admin moderation tab.

## Known gotchas
- `lib/supabase.ts` patches `Headers.set/append` and wraps `fetch` to strip non-Latin-1 characters — Android Chrome throws on Hebrew text in HTTP headers otherwise. Don't remove this.
- `/api/broadcast-push` and `/api/send-push` require `SUPABASE_SERVICE_ROLE_KEY` to read other users' `push_subscriptions` past RLS — they now fail loudly (500) if it's missing instead of silently sending to 0 recipients. Make sure it's set in both `.env.local` and Vercel env vars.
- Geocoding always goes through `/api/geocode` (reverse) and `/api/geocode/search` (forward) — never call Nominatim directly from client code, to keep the User-Agent header and rate-limit-friendly behavior in one place.

## Collection schedule
- 236 streets in Nes Ziona (lib/nes-ziona-streets.ts)
- Each street has: collection_day (יום פינוי) and takeout_day (יום הוצאה)
- Days in Hebrew: ראשון, שני, שלישי, רביעי, חמישי, שישי
