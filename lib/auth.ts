import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase/server";

export type AppUser = { id: string; email: string; displayName: string; role: "owner"|"admin"|"team"|"client"; companyId: string|null; permissions: Record<string, boolean> };

export async function getAppUser(): Promise<AppUser | null> {
  const supabase = await createServerSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) return null;
  const { data: profile } = await supabase.from("profiles").select("id,email,full_name,role,company_id,permissions,status").eq("id", id).single();
  if (!profile || profile.status !== "active") return null;
  return { id: profile.id, email: profile.email, displayName: profile.full_name || profile.email, role: profile.role, companyId: profile.company_id, permissions: profile.permissions || {} };
}

export async function requireAppUser(next: string, roles?: AppUser["role"][]) {
  const user = await getAppUser();
  if (!user) redirect(`${next.startsWith("/admin") ? "/admin-login" : "/login"}?next=${encodeURIComponent(next)}`);
  if (roles && !roles.includes(user.role)) redirect(user.role === "client" ? "/client-portal" : "/admin-portal");
  return user;
}
