import { NextRequest } from "next/server";
import { SupabaseClient, User } from "@supabase/supabase-js";

// Reads the caller's Supabase access token from the Authorization header and
// verifies it server-side. Never trust a client-supplied user id for
// authorization — the id must come from a verified token, as done here.
export async function verifyUser(req: NextRequest, supabase: SupabaseClient): Promise<User | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}
