import {NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";

const partnerSchema=z.object({
  name:z.string().trim().min(2).max(160),
  websiteUrl:z.string().trim().url().max(2048).refine(value=>/^https?:\/\//i.test(value),"Website must start with http:// or https://."),
  domainRating:z.number().min(0).max(100).nullable().optional(),
  organicTraffic:z.number().int().min(0).nullable().optional(),
  email:z.union([z.string().trim().email().max(254),z.literal("")]).optional(),
  contactPerson:z.string().trim().max(160).optional(),
  niche:z.string().trim().max(160).optional(),
  country:z.string().trim().max(120).optional(),
  notes:z.string().trim().max(5000).optional(),
  status:z.enum(["prospect","contacted","active","inactive"]).optional(),
  ownerId:z.string().uuid().optional(),
});

async function getActiveUser(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return {response:NextResponse.json({error:"Please sign in to continue."},{status:401})};
  const {data:profile,error}=await supabase.from("profiles").select("role,account_status").eq("id",user.id).maybeSingle();
  if(error)return {response:NextResponse.json({error:"Could not verify your account."},{status:500})};
  if(profile?.account_status!=="active")return {response:NextResponse.json({error:"Your account is not active."},{status:403})};
  return {supabase,user,profile};
}

export async function GET(request:Request){
  try{
    const access=await getActiveUser();
    if("response" in access)return access.response;
    const {searchParams}=new URL(request.url);
    const search=(searchParams.get("q")??"").replace(/[,%()\\]/g," ").trim().slice(0,80);
    const status=searchParams.get("status")??"";
    const ownerId=searchParams.get("ownerId")??"";
    if(ownerId&&access.profile.role!=="admin")return NextResponse.json({error:"Only an admin can view another workspace."},{status:403});
    let query=access.supabase.from("seo_partners").select("*").order("created_at",{ascending:false});
    if(search)query=query.or(["name","website_url","email","contact_person","niche","country"].map(field=>`${field}.ilike.%${search}%`).join(","));
    if(["prospect","contacted","active","inactive"].includes(status))query=query.eq("status",status);
    if(ownerId)query=query.eq("owner_id",ownerId);
    const {data:partners,error}=await query;
    if(error)throw error;
    let owners:Record<string,{full_name:string;email:string}>={};
    if(access.profile.role==="admin"&&(partners?.length??0)>0){
      const ids=[...new Set((partners??[]).map(item=>item.owner_id))];
      const {data:profiles,error:profilesError}=await access.supabase.from("profiles").select("id,full_name,email").in("id",ids);
      if(profilesError)throw profilesError;
      owners=Object.fromEntries((profiles??[]).map(profile=>[profile.id,{full_name:profile.full_name,email:profile.email}]));
    }
    return NextResponse.json({partners:(partners??[]).map(partner=>({...partner,owner:owners[partner.owner_id]??null}))});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not load partners."},{status:500});
  }
}

export async function POST(request:Request){
  try{
    const access=await getActiveUser();
    if("response" in access)return access.response;
    const parsed=partnerSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Check the partner details."},{status:400});
    const {ownerId,...input}=parsed.data;
    if(ownerId&&access.profile.role!=="admin")return NextResponse.json({error:"Only an admin can assign a partner to another workspace."},{status:403});
    const owner=ownerId??access.user.id;
    if(ownerId){
      const {data:target,error:targetError}=await access.supabase.from("profiles").select("id,account_status").eq("id",ownerId).maybeSingle();
      if(targetError)throw targetError;
      if(!target||target.account_status!=="active")return NextResponse.json({error:"Choose an active team member."},{status:400});
    }
    const {data:partner,error}=await access.supabase.from("seo_partners").insert({
      owner_id:owner,name:input.name,website_url:input.websiteUrl,domain_rating:input.domainRating??null,
      organic_traffic:input.organicTraffic??null,email:input.email||null,contact_person:input.contactPerson||null,
      niche:input.niche||null,country:input.country||null,notes:input.notes||null,status:input.status??"prospect",
    }).select("*").single();
    if(error)throw error;
    return NextResponse.json({partner},{status:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not add partner."},{status:500});
  }
}
