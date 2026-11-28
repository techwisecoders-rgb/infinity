import type { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { ensureNetworksSchema, isMissingSchemaError } from "@/lib/supabase/ensure-networks-schema";

export interface NetworkProfileInput {
  id: string;
  username?: string | null;
  display_name?: string | null;
  account_type?: string | null;
  avatar_url?: string | null;
}

function normalizeHandle(raw: unknown): string {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/^(?:♾️|♾|∞|@)+/u, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return cleaned ? `@${cleaned}` : "";
}

function normalizeAccountType(raw: unknown): string {
  const v = String(raw ?? "").trim().toLowerCase();
  return ["personal", "creator", "business"].includes(v) ? v : "personal";
}

export async function ensureUserNetwork(admin: SupabaseClient, profile: NetworkProfileInput) {
  if (!profile?.id) return null;

  const accountType = normalizeAccountType(profile.account_type);
  const handle = normalizeHandle(profile.username || profile.display_name || `user_${profile.id.slice(0, 8)}`);
  if (!handle) return null;

  let { data: existing, error: findErr } = await admin
    .from("networks")
    .select("*")
    .or(`and(owner_id.eq.${profile.id},account_type.eq.${accountType}),username.ilike.${handle}`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (isMissingSchemaError(findErr)) {
    const ensured = await ensureNetworksSchema();
    if (ensured) {
      ({ data: existing, error: findErr } = await admin
        .from("networks")
        .select("*")
        .or(`and(owner_id.eq.${profile.id},account_type.eq.${accountType}),username.ilike.${handle}`)
        .order("created_at", { ascending: false })
        .limit(1));
    } else {
      ({ data: existing, error: findErr } = await admin
        .from("networks")
        .select("*")
        .or(`owner_id.eq.${profile.id},username.ilike.${handle}`)
        .order("created_at", { ascending: false })
        .limit(1));
    }
  }

  if (Array.isArray(existing) && existing.length > 0) {
    return existing[0];
  }

  const displayName = String(profile.display_name || handle.replace(/^@/, "")).trim().slice(0, 60) || handle;
  const category =
    accountType === "business"
      ? "Business"
      : accountType === "creator"
        ? "Jobs & Careers"
        : "General";

  const payload = {
    id: uuidv4(),
    owner_id: profile.id,
    account_type: accountType,
    name: displayName,
    username: handle.slice(0, 32),
    description: `Official channel for ${displayName}`,
    category,
    image_url: profile.avatar_url || null,
  };

  let { data: created, error: insErr } = await admin
    .from("networks")
    .insert(payload)
    .select("*")
    .single();

  if (isMissingSchemaError(insErr)) {
    const ensured = await ensureNetworksSchema();
    if (ensured) {
      ({ data: created, error: insErr } = await admin
        .from("networks")
        .insert(payload)
        .select("*")
        .single());
    } else {
      const { account_type: _omit, ...fallbackPayload } = payload;
      ({ data: created, error: insErr } = await admin
        .from("networks")
        .insert(fallbackPayload)
        .select("*")
        .single());
    }
  }

  if (insErr) {
    // Handle race condition if another request inserted concurrently
    const { data: retry } = await admin
      .from("networks")
      .select("*")
      .or(`and(owner_id.eq.${profile.id},account_type.eq.${accountType}),username.ilike.${handle}`)
      .limit(1);
    return Array.isArray(retry) && retry.length > 0 ? retry[0] : null;
  }

  return created;
}
