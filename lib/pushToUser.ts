import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export function configureVapid(): boolean {
  const pubKey  = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const privKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (process.env.VAPID_SUBJECT ?? "").trim();
  if (!pubKey || !privKey || !subject) return false;
  webpush.setVapidDetails(subject, pubKey, privKey);
  return true;
}

/** Sends a push to every subscription of a single user and prunes expired (410) ones. Returns count sent. */
export async function pushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url: string }
): Promise<number> {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,subscription")
    .eq("user_id", userId);
  if (error || !subs?.length) return 0;

  const json = JSON.stringify(payload);
  const results = await Promise.allSettled(
    (subs as { endpoint: string; subscription: webpush.PushSubscription }[])
      .map(s => webpush.sendNotification(s.subscription, json))
  );

  const expired = results
    .map((r, i) => ({ r, target: subs[i] }))
    .filter(({ r }) => r.status === "rejected" && (r as PromiseRejectedResult).reason?.statusCode === 410);
  if (expired.length) {
    await Promise.allSettled(
      expired.map(({ target }) => supabase.from("push_subscriptions").delete().eq("endpoint", target.endpoint))
    );
  }

  return results.filter(r => r.status === "fulfilled").length;
}
