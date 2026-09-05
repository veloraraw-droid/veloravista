import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "../../../lib/auth";
import { createAdminSupabase, createServerSupabase } from "../../../lib/supabase/server";
import { sendInternalCustomerUpdate, sendTransactionalEmail } from "../../../lib/transactional-email";

export async function GET() {
  const user = await requireAppUser("/client-portal", ["client"]);
  const supabase = await createServerSupabase();
  const [operations, company, notifications, terms] = await Promise.all([
    supabase.from("operations").select("id,kind,data,status,created_at,updated_at").neq("status","archived").order("updated_at", { ascending: false }),
    user.companyId ? supabase.from("companies").select("id,name,email,phone,status,address").eq("id", user.companyId).single() : Promise.resolve({data:null,error:null}),
    supabase.from("notifications").select("id,title,body,destination,read_at,created_at").order("created_at", { ascending: false }),
    supabase.from("terms_acceptances").select("document_version,accepted_at").eq("profile_id", user.id),
  ]);
  return NextResponse.json({ user, company: company.data, records: operations.data || [], notifications: notifications.data || [], terms: terms.data || [] });
}

export async function POST(request: NextRequest) {
  const user = await requireAppUser("/client-portal", ["client"]);
  const body = await request.json();
  const supabase = await createServerSupabase();
  if (body.action === "accept_terms") {
    const signature = String(body.signature || "").trim();
    if (signature.length < 2) return NextResponse.json({error:"Signature required"},{status:400});
    const { error } = await supabase.from("terms_acceptances").insert({ profile_id: user.id, document_version: "2026-08-07", document_title: "Velora Vista Client Portal Terms", signature_name: signature, user_agent: request.headers.get("user-agent") });
    if (error) return NextResponse.json({error:error.message},{status:400});
    await sendInternalCustomerUpdate({subject:`Customer accepted portal terms — ${user.displayName}`,heading:"Portal terms accepted",details:[["Customer",user.displayName],["Email",user.email],["Signed name",signature],["Time",new Date().toLocaleString("en-CA")]],actionUrl:`${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/admin-portal`});
    return NextResponse.json({ok:true});
  }
  if (body.action === "read_notification") {
    const { error } = await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id", String(body.id)).eq("recipient_id",user.id);
    if (error) return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true});
  }
  if (body.action === "sign_contract") {
    const signature=String(body.signature||"").trim();if(signature.length<2)return NextResponse.json({error:"Signature required"},{status:400});
    const {data:contract}=await supabase.from("operations").select("id,data").eq("id",String(body.id)).eq("kind","contract").single();
    if(!contract)return NextResponse.json({error:"Contract not found"},{status:404});
    const admin=createAdminSupabase();
    const signedAt=new Date().toISOString();
    const updated={...contract.data,status:"signed",signedName:signature,signedAt,signedBy:user.id,signedEmail:user.email,signerDisplayName:user.displayName};
    const {error}=await admin.from("operations").update({data:updated}).eq("id",contract.id);
    if(error)return NextResponse.json({error:error.message},{status:400});
    const contractDetails: Array<[string, unknown]> = [["Contract",updated.number||updated.title||contract.id],["Customer",updated.client||user.displayName],["Signed by",signature],["Email",user.email],["Signed at",new Date(signedAt).toLocaleString("en-CA")]];
    await Promise.all([
      sendInternalCustomerUpdate({subject:`Contract signed — ${updated.number||updated.title||"Customer contract"}`,heading:"A customer signed a contract",details:contractDetails,actionUrl:`${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/admin-portal`}),
      sendTransactionalEmail({to:user.email,subject:`Contract signed: ${updated.number||updated.title||"Velora Vista agreement"}`,heading:"Your contract is signed",details:contractDetails,actionUrl:`${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/client-portal?tab=contracts`,actionLabel:"View signed contract"}),
    ]);
    return NextResponse.json({ok:true,contract:updated});
  }
  if (["comment","approve","request_change","request_meeting"].includes(String(body.action))) {
    const message=String(body.message||"").trim();
    if(message.length<2)return NextResponse.json({error:"Please add a short message"},{status:400});
    const admin=createAdminSupabase(),type=String(body.action);
    const {error}=await admin.from("operations").insert({kind:"client_request",company_id:user.companyId,visible_to_client:true,created_by:user.id,updated_by:user.id,data:{type,title:type==="approve"?"Customer approval":type==="request_meeting"?"Meeting request":type==="request_change"?"Change request":"Customer comment",message,recordId:String(body.recordId||""),status:"open",author:user.displayName}});
    if(error)return NextResponse.json({error:error.message},{status:400});
    const {data:staff}=await admin.from("profiles").select("id").in("role",["owner","admin"]).eq("status","active");
    if(staff?.length)await admin.from("notifications").insert(staff.map(({id})=>({recipient_id:id,title:"New customer portal request",body:message,destination:"/admin-portal"})));
    const title=type==="approve"?"Customer approval":type==="request_meeting"?"Meeting request":type==="request_change"?"Change request":"Customer comment";
    await sendInternalCustomerUpdate({subject:`${title} — ${user.displayName}`,heading:title,details:[["Customer",user.displayName],["Email",user.email],["Message",message],["Related record",String(body.recordId||"General account")],["Time",new Date().toLocaleString("en-CA")]],actionUrl:`${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/admin-portal`});
    return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Unsupported action"},{status:400});
}
