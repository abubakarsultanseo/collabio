import {randomUUID} from "node:crypto";
import {Resend} from "resend";
import type {createAdminClient} from "@/lib/supabase/admin";

type AdminDb=ReturnType<typeof createAdminClient>;
export async function sendCollabEmail(db:AdminDb,input:{to:string|undefined;requestId:string;template:string;subject:string;message:string;anchor?:string}){
  const apiKey=process.env.RESEND_API_KEY;
  if(!apiKey||!input.to)return;
  const key=`${input.requestId}:${input.template}:${randomUUID()}`;
  const {data:log,error:logError}=await db.from("email_logs").insert({recipient_email:input.to,template_key:input.template,request_id:input.requestId,idempotency_key:key,status:"queued"}).select("id").single();
  if(logError)return;
  let status="failed",errorMessage="Email delivery failed.",messageId:string|null=null;
  try{
    const sent=await new Resend(apiKey).emails.send({from:process.env.EMAIL_FROM??"Collabio <partners@collabio.online>",...(process.env.EMAIL_REPLY_TO?{replyTo:process.env.EMAIL_REPLY_TO}:{}),to:input.to,subject:input.subject,html:`<p>${escapeHtml(input.message)}</p>${input.anchor?`<p><strong>${escapeHtml(input.anchor)}</strong></p>`:""}<p>Sign in to Collabio to open this item and continue the collaboration.</p>`});
    if(sent.error)errorMessage=sent.error.message;else{status="sent";errorMessage="";messageId=sent.data?.id??null;}
  }catch(error){errorMessage=error instanceof Error?error.message:"Email delivery failed.";}
  await db.from("email_logs").update({status,error_message:errorMessage||null,provider_message_id:messageId,sent_at:status==="sent"?new Date().toISOString():null}).eq("id",log.id);
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));}
