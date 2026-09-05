import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../lib/supabase/server";
export async function GET(request: Request) { const supabase = await createServerSupabase(); await supabase.auth.signOut(); return NextResponse.redirect(new URL("/login", request.url)); }
