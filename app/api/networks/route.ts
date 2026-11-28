import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureNetworksSchema, isMissingSchemaError } from "@/lib/supabase/ensure-networks-schema";
import { ensureUserNetwork } from "@/lib/supabase/ensure-user-network";
import { v4 as uuidv4 } from "uuid";

function isRealImageUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes("flaticon.com/512/149/149071.png")) return false;
  return true;
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeNetworkUsername(value: unknown): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  return cleaned ? `@${cleaned}` : "";
}

function normalizeAccountType(value: unknown): string {
  const v = String(value ?? "").trim().toLowerCase();
  return ["personal", "creator", "business"].includes(v) ? v : "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fetchAll = url.searchParams.get("all") === "true";
  const accountTypeFilter = normalizeAccountType(url.searchParams.get("account_type"));
  const ownerIdParam = String(url.searchParams.get("owner_id") ?? "").trim();
  const usernameParam = normalizeNetworkUsername(url.searchParams.get("username"));

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  if (fetchAll) {
    let { data: networks, error } = await admin
      .from("networks")
      .select("*")
      .order("created_at", { ascending: false });

    if (isMissingSchemaError(error) && (await ensureNetworksSchema())) {
      ({ data: networks, error } = await admin
        .from("networks")
        .select("*")
        .order("created_at", { ascending: false }));
    }

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
        { status: 500 }
      );
    }

    const ownerAvatarMap = new Map<string, string>();
    const handleAvatarMap = new Map<string, string>();
    // Ensure every existing profile has a corresponding channel/network
    try {
      const { data: allProfiles } = await admin
        .from("profiles")
        .select("id, username, display_name, account_type, avatar_url");
      if (Array.isArray(allProfiles)) {
        for (const p of allProfiles as Array<{ id?: string; username?: string | null; avatar_url?: string | null }>) {
          if (p?.id && isRealImageUrl(p?.avatar_url)) {
            ownerAvatarMap.set(String(p.id), String(p.avatar_url));
            const h = normalizeNetworkUsername(p?.username);
            if (h) handleAvatarMap.set(h, String(p.avatar_url));
          }
        }
      }
      try {
        const { data: workerProfs } = await admin
          .from("worker_profiles")
          .select("user_id, profile_image");
        if (Array.isArray(workerProfs)) {
          for (const wp of workerProfs as Array<{ user_id?: string; profile_image?: string | null }>) {
            if (wp?.user_id && isRealImageUrl(wp?.profile_image) && !ownerAvatarMap.has(String(wp.user_id))) {
              ownerAvatarMap.set(String(wp.user_id), String(wp.profile_image));
            }
          }
        }
      } catch {}
      if (Array.isArray(allProfiles) && allProfiles.length > 0) {
        const existingOwnerKeys = new Set(
          (networks ?? []).map((n: any) => `${n.owner_id}:${String(n.account_type || "personal").toLowerCase()}`)
        );
        const existingHandles = new Set(
          (networks ?? []).map((n: any) => normalizeNetworkUsername(n.username)).filter(Boolean)
        );
        const missing = allProfiles.filter((p: any) => {
          const key = `${p.id}:${normalizeAccountType(p.account_type) || "personal"}`;
          const handle = normalizeNetworkUsername(p.username || p.display_name);
          return !existingOwnerKeys.has(key) && (!handle || !existingHandles.has(handle));
        });
        if (missing.length > 0) {
          for (const p of missing) {
            const created = await ensureUserNetwork(admin, p);
            if (created) networks = [created, ...(networks ?? [])];
          }
        }
      }
    } catch {}

    const viewerIdParam = String(url.searchParams.get("viewer_id") ?? "").trim();
    const isValidViewerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(viewerIdParam);
    const effectiveViewerId = isValidViewerUuid ? viewerIdParam : (user && !authError ? user.id : "");
    let supportedSet = new Set<string>();
    const liveCountMap = new Map<string, number>();
    const { data: allSupportRows } = await admin
      .from("network_supporters")
      .select("network_id, user_id");
    if (Array.isArray(allSupportRows)) {
      for (const row of allSupportRows as Array<{ network_id: string; user_id: string }>) {
        const nid = String(row.network_id || "");
        if (!nid) continue;
        liveCountMap.set(nid, (liveCountMap.get(nid) || 0) + 1);
        if (effectiveViewerId && String(row.user_id) === String(effectiveViewerId)) {
          supportedSet.add(nid);
        }
      }
    }

    const enriched = (networks ?? []).map((n: any) => ({
      ...n,
      image_url: ownerAvatarMap.get(String(n.owner_id)) || handleAvatarMap.get(normalizeNetworkUsername(n.username)) || (isRealImageUrl(n.image_url) ? n.image_url : null),
      supporters_count: liveCountMap.has(n.id) ? liveCountMap.get(n.id)! : Number(n.supporters_count ?? 0),
      is_supported: supportedSet.has(n.id),
    }));

    return NextResponse.json({ success: true, data: enriched });
  }

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const runUserQuery = async () => {
    const targetOwnerId = ownerIdParam || user.id;
    let q = admin
      .from("networks")
      .select("*")
      .order("created_at", { ascending: false });
    if (usernameParam) {
      if (accountTypeFilter) {
        q = q.or(`and(owner_id.eq.${targetOwnerId},account_type.eq.${accountTypeFilter}),username.ilike.${usernameParam}`);
      } else {
        q = q.or(`owner_id.eq.${targetOwnerId},username.ilike.${usernameParam}`);
      }
    } else {
      q = q.eq("owner_id", targetOwnerId);
      if (accountTypeFilter) {
        q = q.eq("account_type", accountTypeFilter);
      }
    }
    return q;
  };

  let { data, error } = await runUserQuery();
  if (isMissingSchemaError(error)) {
    const ensured = await ensureNetworksSchema();
    if (ensured) {
      ({ data, error } = await runUserQuery());
    } else {
      const targetOwnerId = ownerIdParam || user.id;
      let fq = admin.from("networks").select("*").order("created_at", { ascending: false });
      fq = usernameParam
        ? fq.or(`owner_id.eq.${targetOwnerId},username.ilike.${usernameParam}`)
        : fq.eq("owner_id", targetOwnerId);
      ({ data, error } = await fq);
    }
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  let rows = data ?? [];
  if (rows.length === 0) {
    const targetOwnerId = ownerIdParam || user.id;
    let { data: prof } = await admin
      .from("profiles")
      .select("id, username, display_name, account_type, avatar_url")
      .eq("id", targetOwnerId)
      .maybeSingle();
    if (!prof && targetOwnerId !== user.id) {
      ({ data: prof } = await admin
        .from("profiles")
        .select("id, username, display_name, account_type, avatar_url")
        .eq("id", user.id)
        .maybeSingle());
    }
    if (prof) {
      const created = await ensureUserNetwork(admin, prof);
      if (created) rows = [created];
    }
  }

  try {
    const ownerIds = Array.from(new Set(rows.map((r: any) => String(r?.owner_id || "")).filter(Boolean)));
    if (ownerIds.length > 0) {
      const avatarByOwner = new Map<string, string>();
      const avatarByHandle = new Map<string, string>();
      const { data: profRows } = await admin
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", ownerIds);
      if (Array.isArray(profRows)) {
        for (const p of profRows as Array<{ id?: string; username?: string | null; avatar_url?: string | null }>) {
          if (p?.id && isRealImageUrl(p?.avatar_url)) {
            avatarByOwner.set(String(p.id), String(p.avatar_url));
            const h = normalizeNetworkUsername(p?.username);
            if (h) avatarByHandle.set(h, String(p.avatar_url));
          }
        }
      }
      try {
        const { data: wpRows } = await admin
          .from("worker_profiles")
          .select("user_id, profile_image")
          .in("user_id", ownerIds);
        if (Array.isArray(wpRows)) {
          for (const wp of wpRows as Array<{ user_id?: string; profile_image?: string | null }>) {
            if (wp?.user_id && isRealImageUrl(wp?.profile_image) && !avatarByOwner.has(String(wp.user_id))) {
              avatarByOwner.set(String(wp.user_id), String(wp.profile_image));
            }
          }
        }
      } catch {}
      rows = rows.map((r: any) => ({
        ...r,
        image_url: avatarByOwner.get(String(r.owner_id)) || avatarByHandle.get(normalizeNetworkUsername(r.username)) || (isRealImageUrl(r.image_url) ? r.image_url : null),
      }));
    }
  } catch {}

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const username = normalizeNetworkUsername(body?.username);
  const description = String(body?.description ?? "").trim();
  const category = String(body?.category ?? "General").trim() || "General";
  const accountType = normalizeAccountType(body?.account_type) || "personal";
  const rawImageUrl = body?.image_url ?? body?.image ?? "";
  const image_url = normalizeImageUrl(rawImageUrl);

  if (!name || !username || !description) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Please fill all required fields." } },
      { status: 400 }
    );
  }

  if (name.length > 60) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Network name must be 60 characters or fewer." } },
      { status: 400 }
    );
  }

  if (username.length > 32) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Username must be 30 characters or fewer." } },
      { status: 400 }
    );
  }

  if (description.length > 500) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Description must be 500 characters or fewer." } },
      { status: 400 }
    );
  }

  if (String(rawImageUrl).trim() && !image_url) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Enter a valid http or https image URL." } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let { data: existing, error: checkError } = await admin
    .from("networks")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (isMissingSchemaError(checkError) && (await ensureNetworksSchema())) {
    ({ data: existing, error: checkError } = await admin
      .from("networks")
      .select("id")
      .ilike("username", username)
      .maybeSingle());
  }

  if (existing) {
    return NextResponse.json(
      { success: false, error: { code: "CONFLICT", message: "This network username already exists." } },
      { status: 409 }
    );
  }

  const requestedOwnerId = String(body?.owner_id ?? "").trim();
  const isValidOwnerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedOwnerId);
  const insertPayload = {
    id: uuidv4(),
    owner_id: isValidOwnerUuid ? requestedOwnerId : user.id,
    account_type: accountType,
    name,
    username,
    description,
    category,
    image_url,
  };

  let { data, error } = await admin
    .from("networks")
    .insert(insertPayload)
    .select("*")
    .single();

  if (isMissingSchemaError(error)) {
    const ensured = await ensureNetworksSchema();
    if (ensured) {
      ({ data, error } = await admin
        .from("networks")
        .insert(insertPayload)
        .select("*")
        .single());
    } else {
      const { account_type: _omit, ...fallbackInsert } = insertPayload;
      ({ data, error } = await admin
        .from("networks")
        .insert(fallbackInsert)
        .select("*")
        .single());
    }
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
