import {requireUser} from "@/server/auth";
import {getProfile} from "@/server/profile";
import {createAdminClient} from "@/lib/supabase/admin";
import Link from "next/link";

export default async function Dashboard(){
  const user=await requireUser();
  const profile=await getProfile(user.id);
  const db=createAdminClient();
  const {data:partnerships}=await db.from("partnerships").select("id,name,user_a_id,user_b_id").or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`).order("created_at",{ascending:false});
  const ids=(partnerships??[]).map(p=>p.id);
  const [{data:balances},{data:requests}]=await Promise.all([
    ids.length?db.from("deal_balance").select("*").in("partnership_id",ids):Promise.resolve({data:[]}),
    ids.length?db.from("requests").select("id,partnership_id,status,shared_at").in("partnership_id",ids):Promise.resolve({data:[]}),
  ]);
  const allDeals=balances??[];
  const openDeals=allDeals.filter(d=>d.status==="open").length;
  const pending=allDeals.reduce((n,d)=>n+Number(d.side_a_pending)+Number(d.side_b_pending),0);
  const staleCutoff=Date.now()-7*86400000;
  const stale=(requests??[]).filter(r=>r.status==="shared"&&r.shared_at&&new Date(r.shared_at).getTime()<=staleCutoff).length;
  const cards=(partnerships??[]).map(p=>{
    const mySide=p.user_a_id===user.id?"a":"b";
    const deals=allDeals.filter(d=>d.partnership_id===p.id);
    const myDue=deals.reduce((n,d)=>n+Number(mySide==="a"?d.side_a_remaining:d.side_b_remaining),0);
    const partnerDue=deals.reduce((n,d)=>n+Number(mySide==="a"?d.side_b_remaining:d.side_a_remaining),0);
    return {id:p.id,name:p.name,deals,myDue,partnerDue,net:partnerDue-myDue,mySide};
  });
  return <main className="min-h-screen p-6 md:p-10"><div className="mx-auto max-w-6xl">
    <header className="flex items-center justify-between"><div><p className="text-sm font-semibold text-blue-700">COLLABIO</p><h1 className="mt-2 text-3xl font-bold">Welcome, {profile?.full_name??user.email}</h1><p className="muted mt-2">Your shared outreach partnerships and link exchange activity.</p></div><form action="/auth/signout" method="post"><button className="rounded-lg border px-4 py-2">Sign out</button></form></header>
    <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Partnerships",partnerships?.length??0],["Open deals",openDeals],["Pending requests",pending],["Shared 7+ days",stale]].map(([label,value])=><div key={String(label)} className="panel p-5"><p className="muted text-sm">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</section>
    <section className="mt-7"><div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">Partner Summary</h2><Link href="/partnerships" className="text-sm font-medium text-blue-700">View all partnerships →</Link></div>
      {cards.length===0?<div className="panel p-5 text-sm text-slate-600">No partnerships yet. Create one and invite the other active Collabio user to share deals and requests.</div>:<div className="grid gap-3 lg:grid-cols-2">{cards.map(p=><article key={p.id} className="panel p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{p.name}</h3><p className="muted mt-1 text-sm">{p.net>0?`Partner owes you ${p.net} slot${p.net===1?"":"s"}`:p.net<0?`You owe partner ${Math.abs(p.net)} slot${Math.abs(p.net)===1?"":"s"}`:"All square"}</p></div><Link href={`/partnerships/${p.id}`} className="text-sm text-blue-700">Open →</Link></div><p className="muted mt-3 text-xs">Remaining slots (you / partner): {p.myDue} / {p.partnerDue}</p><div className="mt-3 space-y-2">{p.deals.filter(d=>d.status==="open").map(d=><div key={d.deal_id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{d.name} · {p.mySide==="a"?d.side_a_quota:d.side_b_quota}:{p.mySide==="a"?d.side_b_quota:d.side_a_quota}</span><span>You {p.mySide==="a"?d.side_a_remaining:d.side_b_remaining} · Partner {p.mySide==="a"?d.side_b_remaining:d.side_a_remaining}</span></div>)}</div>{p.deals.length===0&&<p className="muted mt-3 text-xs">No deals created yet.</p>}</article>)}</div>}
    </section>
    <section className="panel mt-7 p-6"><h2 className="text-lg font-semibold">Account details</h2><dl className="mt-4 grid gap-4 text-sm md:grid-cols-2"><div><dt className="muted">Email</dt><dd>{user.email}</dd></div><div><dt className="muted">Role</dt><dd>{profile?.role??"Pending profile"}</dd></div><div><dt className="muted">Account status</dt><dd>{profile?.account_status??"Unknown"}</dd></div><div><dt className="muted">Timezone</dt><dd>Asia/Karachi</dd></div></dl></section>
  </div></main>
}
