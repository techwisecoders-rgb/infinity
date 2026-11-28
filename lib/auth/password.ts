import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveUserPasswordHash(
  adminClient: SupabaseClient,
  userId: string,
  password: string,
): Promise<{ error: string | null }> {
  const { error } = await adminClient.rpc("save_user_bcrypt_password", {
    p_user_id: userId,
    p_password: password,
  });

  return { error: error ? error.message : null };
}

export async function verifyUserPasswordHash(
  adminClient: SupabaseClient,
  userId: string,
  password: string,
): Promise<{ valid: boolean; error: string | null }> {
  const { data, error } = await adminClient.rpc("verify_user_bcrypt_password", {
    p_user_id: userId,
    p_password: password,
  });

  if (error) {
    return { valid: false, error: error.message };
  }

  return { valid: data === true, error: null };
}
