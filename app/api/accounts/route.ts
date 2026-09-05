import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabase, createServerSupabase } from "../../../lib/supabase/server";
import { sendPortalInvitation } from "../../../lib/auth-email";
import { canAccessModule } from "../../../lib/permissions";
const schema=z.object({email:z.string().email(),action:z.enum(["suspend","activate","permissions","resend_invite"]),permissions:z.string().optional()});
export async function POST(request:Request){
  const supabase=await createServerSupabase(),{data:claims}=await supabase.auth.getClaims();const id=claims?.claims?.sub;
  if(!id)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data:caller}=await supabase.from("profiles").select("role,status,permissions").eq("id",id).single();
  if(!caller||caller.status!=="active"||!["owner","admin"].includes(caller.role)||!canAccessModule(caller.role,caller.permissions,"team"))return NextResponse.json({error:"Forbidden"},{status:403});
  const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid request"},{status:400});
  const x=parsed.data,admin=createAdminSupabase();
  const {data:profile}=await admin.from("profiles").select("id,role").eq("email",x.email.toLowerCase()).maybeSingle();
  if(!profile)return NextResponse.json({error:"Account not found"},{status:404});
  if(profile.role==="owner")return NextResponse.json({error:"Owner access cannot be changed here"},{status:400});
  if(x.action==="permissions"){
    await admin.from("profiles").update({permissions:{modules:x.permissions||""}}).eq("id",profile.id);
    const {data:teamRecord}=await admin.from("operations").select("id,data").eq("kind","team").eq("data->>email",x.email.toLowerCase()).maybeSingle();
    if(teamRecord)await admin.from("operations").update({data:{...teamRecord.data,permissions:x.permissions||""}}).eq("id",teamRecord.id);
  }
  if(x.action==="suspend"||x.action==="activate"){
    const status=x.action==="suspend"?"suspended":"active";
    await admin.from("profiles").update({status}).eq("id",profile.id);
    const {data:teamRecord}=await admin.from("operations").select("id,data").eq("kind","team").eq("data->>email",x.email.toLowerCase()).maybeSingle();
    if(teamRecord)await admin.from("operations").update({data:{...teamRecord.data,status}}).eq("id",teamRecord.id);
  }
  if(x.action==="resend_invite"){
    const origin=process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin;
    try { await sendPortalInvitation({email:x.email,role:profile.role==="client"?"client":profile.role==="admin"?"admin":"team",origin}); }
    catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invitation could not be sent"},{status:502})}
  }
  return NextResponse.json({ok:true});
}
