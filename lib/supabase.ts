import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://jvrhyjnjvduvmuzbxzui.supabase.co";
// Supabase publishable keys are intentionally safe to expose to browser clients.
// RLS remains the security boundary; the environment variable can override this
// project-specific fallback for alternate deployments.
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_NKGaObRn3K5WeZN8IXy3JA_UPwH6m0-";

export const isSupabaseConfigured = Boolean(anonKey);
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (!anonKey) return null;
  browserClient ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return browserClient;
}
