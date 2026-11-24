import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin";
import {z} from "zod";

const schema=z.object({token:z.string().min(20),password:z.string().min(10).max(128)});

export async function POST(request:Request){
  try{
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Enter a valid invitation token and a password of at least 10 characters."},{status:400});
    const hash=createHash("sha256").update(parsed.data.token).digest("hex");
    const admin=createAdminClient();
    const {data:invite,error:inviteError}=await admin.from("invitations").select("*").eq("token_hash",hash).eq("status","pending").gt("expires_at",new Date().toISOString()).maybeSingle();
    if(inviteError)throw inviteError;
    if(!invite)return NextResponse.json({error:"This invitation is invalid, expired, or already used. Ask the admin to send a new invitation."},{status:400});

    const email=invite.email.toLowerCase();
    const {data:existingProfile,error:existingProfileError}=await admin.from("profiles").select("id,account_status").eq("email",email).maybeSingle();
    if(existingProfileError)throw existingProfileError;
    if(existingProfile?.account_status==="active")return NextResponse.json({error:"This account is already active. Sign in with the existing account."},{status:409});

    let userId:string;
    if(existingProfile){
      const {data:updated,error:updateError}=await admin.auth.admin.updateUserById(existingProfile.id,{password:parsed.data.password,email_confirm:true,user_metadata:{full_name:invite.full_name}});
      if(updateError)throw updateError;
      userId=updated.user.id;
    }else{
      const {data:created,error:createError}=await admin.auth.admin.createUser({email,password:parsed.data.password,email_confirm:true,user_metadata:{full_name:invite.full_name}});
      if(createError)throw createError;
      userId=created.user.id;
    }

    const {error:profileError}=await admin.from("profiles").upsert({id:userId,email,full_name:invite.full_name,company:invite.company,website:invite.website,role:"partner",account_status:"active"});
    if(profileError)throw profileError;
    const {error:partnerError}=await admin.from("partners").upsert({profile_id:userId},{onConflict:"profile_id"});
    if(partnerError)throw partnerError;
    const {error:collabError}=await admin.from("collaborations").upsert({partner_id:userId,status:"active"},{onConflict:"partner_id"});
    if(collabError)throw collabError;
    const {error:membershipError}=await admin.from("memberships").upsert({partner_id:userId,user_id:userId,role:"partner"},{onConflict:"partner_id,user_id"});
    if(membershipError)throw membershipError;
    const {error:permissionError}=await admin.from("partner_permissions").upsert({partner_id:userId},{onConflict:"partner_id"});
    if(permissionError)throw permissionError;

    const {error:workspaceError}=await admin.from("partnerships").upsert({name:invite.full_name,user_a_id:invite.invited_by,user_b_id:userId,created_by:invite.invited_by},{onConflict:"user_a_id,user_b_id"});
    if(workspaceError)throw workspaceError;

    const {error:acceptedError}=await admin.from("invitations").update({status:"accepted",accepted_at:new Date().toISOString()}).eq("id",invite.id).eq("status","pending");
    if(acceptedError)throw acceptedError;
    const {error:notificationError}=await admin.from("notifications").insert({recipient_id:invite.invited_by,type:"invitation_accepted",title:"Invitation Accepted",description:`${invite.full_name} accepted the invitation.`,actor_id:userId});
    if(notificationError)throw notificationError;
    return NextResponse.json({success:true});
  }catch(error){
    const message=error instanceof Error?error.message:"Could not activate account.";
    return NextResponse.json({error:message},{status:500});
  }
}
