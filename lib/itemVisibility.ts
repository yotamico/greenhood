export const APPEAL_WINDOW_MS = 3 * 60 * 60 * 1000;

interface EligibilityFields {
  status: string;
  pickup_day: string | null;
  taken_at: string | null;
  closed_by: string | null;
}

/* owner-direct closures (closed_by is null — set only by the community
   confirm-taken flow) drop off the map/feed immediately; only community-confirmed
   closures get the appeal/dispute window. taken_at is always written in the same
   update as closed_by, so the !!taken_at check is purely for TS narrowing. */
export function isDisplayEligible(it: EligibilityFields, todayStr: string): boolean {
  if (it.status === "active") return it.pickup_day === null || it.pickup_day >= todayStr;
  if (it.status === "taken")  return !!it.closed_by && !!it.taken_at && Date.now() - new Date(it.taken_at).getTime() < APPEAL_WINDOW_MS;
  return false;
}
