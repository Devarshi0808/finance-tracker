import { createClient } from "@supabase/supabase-js";
import { getClientEnv, getServerEnv } from "@/lib/env";

export function createSupabaseServiceClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getClientEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for service operations");
  }
  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

