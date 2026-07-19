import { supabase } from "./supabase";

// @ts-nocheck — FarmLedger is a loosely-typed JS component; the row objects
// flowing through here are plain records keyed exactly like the DB columns.

/** App entity key -> Postgres table name. */
export const ENTITY_TABLES: Record<string, string> = {
  wages: "wages",
  expenses: "expenses",
  harvest: "harvest",
  payments: "payments",
  treeLoss: "tree_loss",
  watering: "watering",
  pests: "pests",
  soilTests: "soil_tests",
};

// Fields the DB owns — never send these on insert (user_id is filled by the
// column default = auth.uid(); id/created_at are generated).
const SERVER_FIELDS = new Set(["id", "user_id", "created_at"]);

/** Drop server-owned fields and turn "" into null so empty inputs don't fail
 *  numeric columns. */
function clean(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SERVER_FIELDS.has(k)) continue;
    out[k] = v === "" ? null : v;
  }
  return out;
}

function tableFor(entity: string) {
  const t = ENTITY_TABLES[entity];
  if (!t) throw new Error(`Unknown entity: ${entity}`);
  return t;
}

/** All of the signed-in user's rows for an entity (RLS scopes to auth.uid()). */
export async function listAll(entity: string): Promise<any[]> {
  const { data, error } = await supabase
    .from(tableFor(entity))
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Insert one row; returns the saved row (with generated id). */
export async function insertRow(entity: string, obj: Record<string, any>) {
  const { data, error } = await supabase
    .from(tableFor(entity))
    .insert(clean(obj))
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Bulk insert (used for one-time seed import). Returns inserted rows. */
export async function insertMany(entity: string, rows: Record<string, any>[]) {
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from(tableFor(entity))
    .insert(rows.map(clean))
    .select();
  if (error) throw error;
  return data || [];
}

export async function updateRow(entity: string, id: string, obj: Record<string, any>) {
  const { data, error } = await supabase
    .from(tableFor(entity))
    .update(clean(obj))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRow(entity: string, id: string) {
  const { error } = await supabase.from(tableFor(entity)).delete().eq("id", id);
  if (error) throw error;
}

/** Per-user key/value settings (e.g. Agmarknet API key). */
export async function getSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const { error } = await supabase
    .from("settings")
    .upsert({ key, value }, { onConflict: "user_id,key" });
  if (error) throw error;
}
