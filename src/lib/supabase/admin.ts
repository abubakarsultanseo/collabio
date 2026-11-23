import {createClient as createSupabaseClient} from "@supabase/supabase-js";
// Server-only privileged client. Never import this module into a Client Component.
export function createAdminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing=[!url?"NEXT_PUBLIC_SUPABASE_URL":null,!key?"SUPABASE_SERVICE_ROLE_KEY":null].filter(Boolean);
  if(missing.length)throw new Error(`Missing server environment variable(s): ${missing.join(", ")}`);
  return createSupabaseClient(url!,key!,{auth:{autoRefreshToken:false,persistSession:false}});
}
