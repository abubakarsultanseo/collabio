import {notFound} from "next/navigation";
import {requireUser} from "@/server/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import PartnershipDetail from "@/components/partnership-detail";
export default async function PartnershipPage({params}:{params:Promise<{id:string}>}){const user=await requireUser();const {id}=await params;const db=createAdminClient();const {data:p}=await db.from("partnerships").select("id,name,user_a_id,user_b_id").eq("id",id).maybeSingle();if(!p||![p.user_a_id,p.user_b_id].includes(user.id))notFound();return <PartnershipDetail id={p.id} name={p.name} currentUserId={user.id} sideAId={p.user_a_id} sideBId={p.user_b_id}/>}
