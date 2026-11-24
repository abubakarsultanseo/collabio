import {NextResponse} from "next/server";
import {randomBytes,createHash} from "node:crypto";
import {Resend} from "resend";
import {createAdminClient} from "@/lib/supabase/admin";
import {createClient} from "@/lib/supabase/server";
import {invitationSchema} from "@/validations/invitation";

export async function POST(request:Request){
  try{
    const auth=await createClient();
    const {data:{user}}=await auth.auth.getUser();
    if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
    const {data:profile,error:profileError}=await auth.from("profiles").select("role,account_status").eq("id",user.id).maybeSingle();
    if(profileError)throw profileError;
    if(profile?.role!=="admin"||profile.account_status!=="active")return NextResponse.json({error:"Admin access required."},{status:403});

    const parsed=invitationSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid invitation details."},{status:400});
    const appUrl=(process.env.NEXT_PUBLIC_SITE_URL??process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/,"");
    if(!appUrl)return NextResponse.json({error:"NEXT_PUBLIC_SITE_URL (or NEXT_PUBLIC_APP_URL) is not configured."},{status:503});
    const resendKey=process.env.RESEND_API_KEY;
    if(!resendKey)return NextResponse.json({error:"RESEND_API_KEY is not configured."},{status:503});

    const input=parsed.data;
    const admin=createAdminClient();
    const email=input.email.toLowerCase();
    const {data:existing,error:existingError}=await admin.from("profiles").select("id,account_status").eq("email",email).maybeSingle();
    if(existingError)throw existingError;
    if(existing?.account_status==="active")return NextResponse.json({error:"An active account already exists for this email."},{status:409});

    const {data:oldInvite,error:oldInviteError}=await admin.from("invitations").select("id").eq("email",email).eq("status","pending").maybeSingle();
    if(oldInviteError)throw oldInviteError;
    if(oldInvite){
      const {error:expireError}=await admin.from("invitations").update({status:"expired"}).eq("id",oldInvite.id);
      if(expireError)throw expireError;
    }

    const token=randomBytes(32).toString("base64url");
    const tokenHash=createHash("sha256").update(token).digest("hex");
    const hours=Math.min(168,Math.max(1,Number(process.env.INVITATION_EXPIRY_HOURS??48)));
    const expiresAt=new Date(Date.now()+hours*3600000).toISOString();
    const {data:invite,error:inviteError}=await admin.from("invitations").insert({email,full_name:input.name,company:input.company||null,website:input.website||null,token_hash:tokenHash,expires_at:expiresAt,invited_by:user.id,status:"pending"}).select("id").single();
    if(inviteError)throw inviteError;

    const resend=new Resend(resendKey);
    const link=`${appUrl}/accept-invitation?token=${token}`;
    const sent=await resend.emails.send({
      from:process.env.EMAIL_FROM??"Collabio <partners@collabio.online>",
      ...(process.env.EMAIL_REPLY_TO?{replyTo:process.env.EMAIL_REPLY_TO}:{}),
      to:email,
      subject:"You are invited to Collabio",
      html:`<p>Hello ${escapeHtml(input.name)},</p><p>You have been invited to join Collabio.</p><p><a href="${link}">Accept invitation</a></p><p>This invitation expires in ${hours} hours.</p>`,
    });
    if(sent.error){
      await admin.from("invitations").update({status:"email_failed"}).eq("id",invite.id);
      throw new Error(sent.error.message);
    }
    return NextResponse.json({success:true});
  }catch(error){
    const message=error instanceof Error?error.message:"Unexpected server error.";
    return NextResponse.json({error:message},{status:500});
  }
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
