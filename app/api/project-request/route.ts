import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabase } from "../../../lib/supabase/server";
import { Resend } from "resend";
const schema=z.object({name:z.string().min(2).max(120),company:z.string().max(160).optional(),email:z.string().email(),phone:z.string().min(7).max(40),service:z.string().min(2).max(120),details:z.string().max(4000).optional(),time:z.string().max(100).optional()});
const escapeHtml=(value:string|undefined)=>(value||"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]!);
export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({error:"Please check the form details."},{status:400});
  const x=parsed.data,admin=createAdminSupabase();
  const {error}=await admin.from("project_requests").insert({name:x.name,company:x.company,email:x.email.toLowerCase(),phone:x.phone,service:x.service,details:x.details,preferred_time:x.time});
  if(error)return NextResponse.json({error:"Request could not be saved."},{status:500});
  let emailStatus="not_configured";
  if(process.env.RESEND_API_KEY){
    const resend=new Resend(process.env.RESEND_API_KEY);
    const safe=Object.fromEntries(Object.entries(x).map(([key,value])=>[key,escapeHtml(value)]));
    const result=await resend.emails.send({
      from:"Velora Website <info@veloravistavisuals.com>",
      to:"info@veloravistavisuals.com",
      replyTo:x.email,
      subject:`New project request — ${x.name}`,
      html:`<div style="font-family:Arial,sans-serif;max-width:640px"><h2>New website inquiry</h2><p><b>Name:</b> ${safe.name}</p><p><b>Company:</b> ${safe.company||"Not provided"}</p><p><b>Email:</b> ${safe.email}</p><p><b>Phone:</b> ${safe.phone}</p><p><b>Service:</b> ${safe.service}</p><p><b>Best time to call:</b> ${safe.time||"Any time"}</p><p><b>Project details:</b><br>${safe.details||"Not provided"}</p></div>`
    });
    emailStatus=result.error?"failed":"sent";
    if(result.error)console.error("Inquiry notification email failed",result.error);
  }
  return NextResponse.json({ok:true,emailStatus});
}
