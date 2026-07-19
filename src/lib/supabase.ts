import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True only when both env vars are present — lets the UI show a setup hint
 *  instead of crashing when .env hasn't been filled in yet. */
export const isSupabaseConfigured = Boolean(url && anonKey);

// createClient throws on empty strings, so fall back to harmless placeholders
// when unconfigured; AuthGate checks `isSupabaseConfigured` before using it.
export const supabase = createClient(
  url || "http://localhost:54321",
  anonKey || "placeholder-anon-key",
);
