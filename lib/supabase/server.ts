import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createServerSupabase() {
  const jar = await cookies();
  return createServerClient(url(), key(), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch {}
      },
    },
  });
}

export function createAdminSupabase() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Supabase server secret is not configured");
  return createClient(url(), secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
