import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Auth ──
export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── Activity logging ──
export async function logActivity(
  userId: string,
  userEmail: string,
  action: string,
  metadata?: Record<string, unknown>
) {
  await supabase.from("activity_logs").insert([{
    user_id:    userId,
    user_email: userEmail,
    action,
    metadata:   metadata ?? null,
  }]);
}

// ── Admin ──
export interface UserProfile {
  id: string;
  email: string;
  display_name?: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export async function getUserProfiles(): Promise<UserProfile[]> {
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as UserProfile[];
}

export async function getActivityLogs(limit = 200): Promise<ActivityLog[]> {
  const { data } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ActivityLog[];
}

// ── Reports ──
export interface Report {
  id: string;
  street_name: string;
  item_type: string;
  category?: string | null;
  item_description?: string | null;
  item_condition?: string | null;
  notes?: string | null;
  is_taken?: boolean;
  lat: number | null;
  lng: number | null;
  takeout_day: string | null;
  collection_day: string | null;
  created_at: string;
  user_id?: string | null;
  user_email?: string | null;
}

export async function insertReport(
  data: Omit<Report, "id" | "created_at">
): Promise<{ data: Report | null; error: Error | null }> {
  const { data: row, error } = await supabase
    .from("reports")
    .insert([data])
    .select()
    .single();
  return { data: row as Report | null, error: error as Error | null };
}

export async function deleteReport(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("reports").delete().eq("id", id);
  return { error: error as Error | null };
}

export async function updateReport(
  id: string,
  data: Partial<Omit<Report, "id" | "created_at">>
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("reports").update(data).eq("id", id);
  return { error: error as Error | null };
}

export async function getReports(): Promise<Report[]> {
  const { data } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  return (data as Report[]) ?? [];
}
