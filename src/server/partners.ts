import {createClient} from "@/lib/supabase/server";
export async function listPartners(){const supabase=await createClient();const {data,error}=await supabase.from("profiles").select("id,full_name,email,company,account_status").eq("role","partner").order("created_at",{ascending:false});if(error)throw new Error(error.message);return data??[];}
