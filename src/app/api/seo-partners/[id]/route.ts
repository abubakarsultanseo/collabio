import {NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";

const updateSchema=z.object({
  name:z.string().trim().min(2).max(160).optional(),
  websiteUrl:z.string().trim().url().max(2048).refine(value=>/^https?:\/\//i.test(value),"Website must start with http:// or https://.").optional(),
  domainRating:z.number().min(0).max(100).nullable().optional(),
  organicTraffic:z.number().int().min(0).nullable().optional(),
  email:z.union([z.string().trim().email().max(254),z.literal("")]).optional(),
  contactPerson:z.string().trim().max(160).optional(),
  niche:z.string().trim().max(160).optional(),
  country:z.string().trim().max(120).optional(),
  notes:z.string().trim().max(5000).optional(),
  status:z.enum(["prospect","contacted","active","inactive"]).optional(),
}).refine(value=>Object.keys(value).length>0,"Choose at least one field to update.");

async function getActiveUser(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return {response:NextResponse.json({error:"Please sign in to continue."},{status:401})};
  const {data:profile,error}=await supabase.from("profiles").select("role,account_status").eq("id",user.id).maybeSingle();
  if(error)return {response:NextResponse.json({error:"Could not verify your account."},{status:500})};
  if(profile?.account_status!=="active")return {response:NextResponse.json({error:"Your account is not active."},{status:403})};
  return {supabase,user,profile};
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const access=await getActiveUser();
    if("response" in access)return access.response;
    const parsed=updateSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Check the partner details."},{status:400});
    const input=parsed.data;
    const update={
      ...(input.name!==undefined?{name:input.name}:{}),
      ...(input.websiteUrl!==undefined?{website_url:input.websiteUrl}:{}),
      ...(input.domainRating!==undefined?{domain_rating:input.domainRating}:{}),
      ...(input.organicTraffic!==undefined?{organic_traffic:input.organicTraffic}:{}),
      ...(input.email!==undefined?{email:input.email||null}:{}),
      ...(input.contactPerson!==undefined?{contact_person:input.contactPerson||null}:{}),
      ...(input.niche!==undefined?{niche:input.niche||null}:{}),
      ...(input.country!==undefined?{country:input.country||null}:{}),
      ...(input.notes!==undefined?{notes:input.notes||null}:{}),
      ...(input.status!==undefined?{status:input.status}:{}),
      updated_at:new Date().toISOString(),
    };
    const {id}=await params;
    const {data:partner,error}=await access.supabase.from("seo_partners").update(update).eq("id",id).select("*").maybeSingle();
    if(error)throw error;
    if(!partner)return NextResponse.json({error:"Partner not found or you do not have access."},{status:404});
    return NextResponse.json({partner});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not update partner."},{status:500});
  }
}

export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const access=await getActiveUser();
    if("response" in access)return access.response;
    const {id}=await params;
    const {data:partner,error}=await access.supabase.from("seo_partners").delete().eq("id",id).select("id").maybeSingle();
    if(error)throw error;
    if(!partner)return NextResponse.json({error:"Partner not found or you do not have access."},{status:404});
    return NextResponse.json({success:true});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not delete partner."},{status:500});
  }
}
