import {NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";

const fields=["view_requests","add_new_requests","edit_own_requests","edit_admin_requests","edit_partner_requests","update_request_status","add_comments","delete_requests","view_activity_history","download_reports"] as const;
const defaults={view_requests:true,add_new_requests:true,edit_own_requests:true,edit_admin_requests:false,edit_partner_requests:false,update_request_status:true,add_comments:true,delete_requests:false,view_activity_history:true,download_reports:false};
const updateSchema=z.object({partnerId:z.string().uuid(),permissions:z.object(Object.fromEntries(fields.map(field=>[field,z.boolean().optional()])))});

async function adminUser(){
  const auth=await createClient();const {data:{user}}=await auth.auth.getUser();
  if(!user)return {error:NextResponse.json({error:"Authentication required."},{status:401})};
  const {data:profile,error}=await auth.from("profiles").select("role,account_status").eq("id",user.id).maybeSingle();
  if(error)throw error;
  if(profile?.role!=="admin"||profile.account_status!=="active")return {error:NextResponse.json({error:"Admin access required."},{status:403})};
  return {user};
}

export async function GET(){
  try{
    const access=await adminUser();if("error" in access)return access.error;
    const db=createAdminClient();
    const [{data:partners,error:partnersError},{data:permissions,error:permissionsError},{data:history,error:historyError}]=await Promise.all([
      db.from("profiles").select("id,full_name,email,account_status").eq("role","partner").order("full_name"),
      db.from("partner_permissions").select("partner_id,view_requests,add_new_requests,edit_own_requests,edit_admin_requests,edit_partner_requests,update_request_status,add_comments,delete_requests,view_activity_history,download_reports"),
      db.from("permission_history").select("id,partner_id,changed_by,previous_values,new_values,changed_at").order("changed_at",{ascending:false}).limit(100),
    ]);
    if(partnersError)throw partnersError;if(permissionsError)throw permissionsError;if(historyError)throw historyError;
    const permissionMap=Object.fromEntries((permissions??[]).map(item=>[item.partner_id,item]));
    const names=Object.fromEntries((partners??[]).map(partner=>[partner.id,partner.full_name]));
    return NextResponse.json({partners:(partners??[]).map(partner=>({...partner,permissions:permissionMap[partner.id]??{partner_id:partner.id,...defaults}})),history:(history??[]).map(item=>({...item,partner_name:names[item.partner_id]??"Partner"}))});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not load permissions."},{status:500});}
}

export async function PATCH(request:Request){
  try{
    const access=await adminUser();if("error" in access)return access.error;
    const parsed=updateSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid permission update."},{status:400});
    const db=createAdminClient();const {partnerId,permissions}=parsed.data;
    const {data:old,error:oldError}=await db.from("partner_permissions").select("*").eq("partner_id",partnerId).maybeSingle();if(oldError)throw oldError;
    const previous=old??{partner_id:partnerId,...defaults};
    const next={...previous,...permissions,partner_id:partnerId};
    const {error:updateError}=await db.from("partner_permissions").upsert(next,{onConflict:"partner_id"});if(updateError)throw updateError;
    const {error:historyError}=await db.from("permission_history").insert({partner_id:partnerId,changed_by:access.user.id,previous_values:previous,new_values:next});if(historyError)throw historyError;
    return NextResponse.json({success:true,permissions:next});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not save permissions."},{status:500});}
}
