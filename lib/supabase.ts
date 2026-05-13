import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

export async function getReports(): Promise<Report[]> {
  const { data } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  return (data as Report[]) ?? [];
}
