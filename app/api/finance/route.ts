import { NextRequest, NextResponse } from "next/server";
import { getAppUser } from "../../../lib/auth";
import { canAccessModule } from "../../../lib/permissions";
import { createAdminSupabase } from "../../../lib/supabase/server";
import { financeEntries, normalizeFinanceEntry } from "../../../lib/finance";
import { syncStripeIncome } from "../../../lib/finance-server";
import { z } from "zod";

async function financeUser() {
  const user = await getAppUser();
  return user && user.role !== "client" && canAccessModule(user.role,user.permissions,"billing") ? user : null;
}
const idSchema = z.string().uuid();
export async function GET() {
  if (!(await financeUser())) return NextResponse.json({error:"Billing access required."},{status:403});
  const admin = createAdminSupabase();
  const records = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from("operations").select("id,kind,data,status,created_at,updated_at").in("kind",["invoice","financial_income","financial_expense"]).neq("status","archived").order("id").range(offset,offset+999);
    if (error) return NextResponse.json({error:"Could not load finance records."},{status:500});
    records.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return NextResponse.json({entries:financeEntries(records),outstanding:records.filter(record => record.kind === "invoice" && !["paid","void"].includes(record.data.status)).reduce((sum,record) => sum+Math.round(Number(record.data.total||0)*100),0)/100});
}
export async function POST(request: NextRequest) {
  const user = await financeUser();
  if (!user) return NextResponse.json({error:"Billing access required."},{status:403});
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"Invalid request origin."},{status:403});
  const body = await request.json().catch(() => null);
  if (body?.action === "sync") {
    try { return NextResponse.json({ok:true,...await syncStripeIncome()}); }
    catch { return NextResponse.json({error:"Stripe sync could not finish. Saved records are still available. Please retry."},{status:503}); }
  }
  if (!idSchema.safeParse(body?.id).success || !["income","expense"].includes(body?.type)) return NextResponse.json({error:"Invalid finance entry."},{status:400});
  let data;
  try { data = normalizeFinanceEntry(body.data || {}); } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Invalid finance entry."},{status:400}); }
  const admin = createAdminSupabase();
  const { error } = await admin.from("operations").upsert({id:body.id,kind:body.type === "income" ? "financial_income" : "financial_expense",data,visible_to_client:false,created_by:user.id,updated_by:user.id},{onConflict:"id",ignoreDuplicates:true});
  if (error) return NextResponse.json({error:"Could not save finance entry."},{status:500});
  return NextResponse.json({ok:true});
}
export async function PATCH(request: NextRequest) {
  const user = await financeUser();
  if (!user) return NextResponse.json({error:"Billing access required."},{status:403});
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"Invalid request origin."},{status:403});
  const body = await request.json().catch(() => null);
  if (!idSchema.safeParse(body?.id).success) return NextResponse.json({error:"Invalid entry."},{status:400});
  const admin = createAdminSupabase();
  const { data: entry } = await admin.from("operations").select("id,data,updated_at").eq("id",body.id).in("kind",["financial_income","financial_expense"]).neq("status","archived").single();
  if (!entry || entry.data.source !== "manual") return NextResponse.json({error:"Only manual entries can be edited."},{status:403});
  let data;
  try { data = normalizeFinanceEntry(body.data || {}); } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Invalid entry."},{status:400}); }
  const { data: saved, error } = await admin.from("operations").update({data,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",entry.id).eq("updated_at",entry.updated_at).select("id").maybeSingle();
  if (error || !saved) return NextResponse.json({error:"Entry changed or could not be saved. Refresh and retry."},{status:409});
  return NextResponse.json({ok:true});
}
export async function DELETE(request: NextRequest) {
  const user = await financeUser();
  if (!user) return NextResponse.json({error:"Billing access required."},{status:403});
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"Invalid request origin."},{status:403});
  const id = request.nextUrl.searchParams.get("id");
  if (!idSchema.safeParse(id).success) return NextResponse.json({error:"Invalid entry."},{status:400});
  const admin = createAdminSupabase();
  const { data: entry } = await admin.from("operations").select("id,data,updated_at").eq("id",id!).in("kind",["financial_income","financial_expense"]).neq("status","archived").single();
  if (!entry || entry.data.source !== "manual") return NextResponse.json({error:"Only manual entries can be removed."},{status:403});
  const { data: saved, error } = await admin.from("operations").update({status:"archived",updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",entry.id).eq("updated_at",entry.updated_at).select("id").maybeSingle();
  if (error || !saved) return NextResponse.json({error:"Entry changed or could not be removed. Refresh and retry."},{status:409});
  return NextResponse.json({ok:true});
}
