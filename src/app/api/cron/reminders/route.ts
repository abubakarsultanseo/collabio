import {NextResponse} from "next/server";
import {Resend} from "resend";
import {createAdminClient} from "@/lib/supabase/admin";

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret)return NextResponse.json({error:"CRON_SECRET is not configured."},{status:503});
  if(request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized."},{status:401});
  const db=createAdminClient();
  const now=new Date().toISOString();
  const {data:jobs,error}=await db.from("reminder_jobs").select("id,request_id,job_type,due_at").is("processed_at",null).lte("due_at",now).order("due_at").limit(100);
  if(error)return NextResponse.json({error:error.message},{status:500});
  let processed=0;let failed=0;
  for(const job of jobs??[]){
    try{
      const {data:row,error:requestError}=await db.from("requests").select("id,partner_id,sender_id,receiver_id,anchor_text,placement_page_url,first_viewed_at,status,deadline_at").eq("id",job.request_id).maybeSingle();
      if(requestError)throw requestError;
      if(row&&!row.first_viewed_at){
        const isOverdue=job.job_type==="24_hour_overdue";
        if(isOverdue){
          const {error:updateError}=await db.from("requests").update({was_overdue:true,overdue_at:now,status:"overdue",last_updated_by:row.sender_id}).eq("id",row.id).is("first_viewed_at",null);
          if(updateError)throw updateError;
        }
        const recipient=isOverdue?row.sender_id:row.receiver_id;
        const title=isOverdue?"Request overdue":"Request reminder";
        const description=isOverdue?"Your request was not opened within 24 hours.":"A collaboration request is waiting for review.";
        const reminderType=isOverdue?"request_overdue":"request_reminder";
        const {data:existingNotice,error:noticeLookupError}=await db.from("notifications").select("id").eq("recipient_id",recipient).eq("request_id",row.id).eq("type",reminderType).maybeSingle();
        if(noticeLookupError)throw noticeLookupError;
        if(!existingNotice){const {error:notificationError}=await db.from("notifications").insert({recipient_id:recipient,actor_id:null,request_id:row.id,type:reminderType,title,description});if(notificationError)throw notificationError;}
        const {data:profile,error:profileError}=await db.from("profiles").select("email,full_name").eq("id",recipient).maybeSingle();
        if(profileError)throw profileError;
        const resend=process.env.RESEND_API_KEY?new Resend(process.env.RESEND_API_KEY):undefined;
        await sendEmail(db,resend,job.id,job.request_id,job.job_type,profile?.email,row.anchor_text,description);
      }
      const {error:doneError}=await db.from("reminder_jobs").update({processed_at:now}).eq("id",job.id).is("processed_at",null);
      if(doneError)throw doneError;
      processed++;
    }catch(error){failed++;console.error("Reminder job failed",job.id,error instanceof Error?error.message:"Unknown error");}
  }
  return NextResponse.json({processed,failed});
}

async function sendEmail(db:ReturnType<typeof createAdminClient>,resend:Resend|undefined,jobId:string,requestId:string,jobType:string,email:string|undefined,anchor:string,description:string){
  const key=`${jobId}:reminder`;
  const {error:logError}=await db.from("email_logs").insert({recipient_email:email??"unknown",template_key:jobType,request_id:requestId,idempotency_key:key,status:"queued"});
  if(logError&&logError.code!=="23505")throw logError;
  if(logError?.code==="23505")return;
  let status="failed";let errorMessage="RESEND_API_KEY or recipient email is not configured.";let providerId:string|null=null;
  if(resend&&email){
    const sent=await resend.emails.send({from:process.env.EMAIL_FROM??"Collabio <partners@collabio.online>",to:email,subject:jobType==="24_hour_overdue"?"Collabio request is overdue":"Collabio request reminder",html:`<p>${escapeHtml(description)}</p><p><strong>${escapeHtml(anchor)}</strong></p><p>Open Collabio to review the request and continue the collaboration.</p>`});
    if(sent.error)errorMessage=sent.error.message;else{status="sent";errorMessage="";providerId=sent.data?.id??null;}
  }
  await db.from("email_logs").update({status,error_message:errorMessage||null,provider_message_id:providerId,sent_at:status==="sent"?new Date().toISOString():null}).eq("idempotency_key",key);
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));}
