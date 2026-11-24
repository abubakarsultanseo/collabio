import Link from "next/link";
import {ArrowUpRight,CheckCircle2,Clock3,Inbox,Send,Users} from "lucide-react";
import {requireUser} from "@/server/auth";
import {getProfile} from "@/server/profile";
import {createAdminClient} from "@/lib/supabase/admin";

function formatDate(value:string){return new Intl.DateTimeFormat("en-PK",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Karachi"}).format(new Date(value));}

export default async function Dashboard(){
  const user=await requireUser();
  const profile=await getProfile(user.id);
  const adminView=profile?.role==="admin";
  const db=createAdminClient();
  const partnershipQuery=db.from("partnerships").select("id,name,user_a_id,user_b_id,created_at").order("created_at",{ascending:false});
  const {data:partnerships,error:partnershipError}=adminView?await partnershipQuery:await partnershipQuery.or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
  if(partnershipError)throw new Error(partnershipError.message);
  const rows=partnerships??[];
  const ids=rows.map(row=>row.id);
  const [{data:requests,error:requestsError},{count:activePartnerCount,error:countError}]=await Promise.all([
    ids.length?db.from("requests").select("id,partnership_id,sender_id,receiver_id,partner_id,status,anchor_text,placement_page_url,deadline_at,first_viewed_at,was_overdue,created_at,request_type").in("partnership_id",ids).order("created_at",{ascending:false}).limit(200):Promise.resolve({data:[],error:null}),
    adminView?db.from("profiles").select("id",{count:"exact",head:true}).eq("role","partner").eq("account_status","active"):Promise.resolve({count:1,error:null}),
  ]);
  if(requestsError)throw new Error(requestsError.message);
  if(countError)throw new Error(countError.message);
  const all=requests??[];
  const today=new Date();today.setHours(0,0,0,0);
  const receivedToday=all.filter(row=>row.receiver_id===user.id&&new Date(row.created_at)>=today).length;
  const sentToday=all.filter(row=>row.sender_id===user.id&&new Date(row.created_at)>=today).length;
  const awaitingReview=all.filter(row=>row.receiver_id===user.id&&!row.first_viewed_at&&row.status==="new_request").length;
  const overdue=all.filter(row=>row.was_overdue||row.status==="overdue"||(new Date(row.deadline_at)<new Date()&&!row.first_viewed_at)).length;
  const live=all.filter(row=>row.status==="live").length;
  const recent=all.slice(0,8);
  const partnerStats=rows.map(partnership=>{
    const counterpartId=partnership.user_a_id===user.id?partnership.user_b_id:partnership.user_a_id;
    const count=all.filter(row=>row.partnership_id===partnership.id).length;
    const inbound=all.filter(row=>row.partnership_id===partnership.id&&row.receiver_id===user.id).length;
    const outbound=all.filter(row=>row.partnership_id===partnership.id&&row.sender_id===user.id).length;
    return {id:partnership.id,name:partnership.name,counterpartId,count,inbound,outbound};
  });
  const profileIds=[...new Set(recent.flatMap(row=>[row.sender_id,row.receiver_id]))];
  const {data:people}=profileIds.length?await db.from("profiles").select("id,full_name,email").in("id",profileIds):{data:[]};
  const personMap=Object.fromEntries((people??[]).map(person=>[person.id,person]));
  const statCards=adminView?[
    {label:"Active Partners",value:activePartnerCount??0,icon:Users,color:"text-slate-700"},
    {label:"Total Requests",value:all.length,icon:Inbox,color:"text-slate-700"},
    {label:"Live Placements",value:live,icon:CheckCircle2,color:"text-emerald-700"},
    {label:"Overdue Requests",value:overdue,icon:Clock3,color:"text-red-600"},
  ]:[
    {label:"Requests Received",value:all.filter(row=>row.receiver_id===user.id).length,icon:Inbox,color:"text-slate-700"},
    {label:"Requests Sent",value:all.filter(row=>row.sender_id===user.id).length,icon:Send,color:"text-slate-700"},
    {label:"Live Placements",value:live,icon:CheckCircle2,color:"text-emerald-700"},
    {label:"Pending & Overdue",value:overdue,icon:Clock3,color:"text-red-600"},
  ];
  return <main className="mx-auto max-w-[1440px] space-y-6 p-5 md:p-8 lg:p-10">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700">{adminView?"Company-wide admin workspace":"Private partner workspace"}</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{adminView?"Admin Dashboard":"Welcome back, "+(profile?.full_name??user.email)}</h1><p className="muted mt-2">{adminView?"See what needs attention and manage partner requests.":"See incoming requests, track work, and contact your partners."}</p></div><Link href="/partnerships" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Send a request <ArrowUpRight size={16}/></Link></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statCards.map(({label,value,icon:Icon,color})=><article key={label} className="panel p-5"><Icon className={color} size={18}/><p className="mt-4 text-3xl font-bold text-slate-900">{value}</p><p className="muted mt-1 text-sm">{label}</p></article>)}</section>
    <section aria-label="Quick actions" className="grid gap-3 md:grid-cols-3">
      <Link href="/partnerships" className="group rounded-2xl border border-blue-200 bg-blue-50/70 p-5 transition hover:border-blue-300 hover:bg-blue-50"><span className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-700"><Send size={18}/></span><ArrowUpRight size={17} className="text-blue-700 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"/></span><span className="mt-4 block font-semibold text-slate-900">Send a request</span><span className="mt-1 block text-sm text-slate-600">Choose a partner workspace and submit placement details.</span></Link>
      <Link href="/requests/inbox" className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50"><span className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Inbox size={18}/></span><ArrowUpRight size={17} className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"/></span><span className="mt-4 block font-semibold text-slate-900">Review received requests</span><span className="mt-1 block text-sm text-slate-600">Open a request, update its status, or reply with a message.</span></Link>
      <Link href="/requests/sent" className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50"><span className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Clock3 size={18}/></span><ArrowUpRight size={17} className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"/></span><span className="mt-4 block font-semibold text-slate-900">Track sent requests</span><span className="mt-1 block text-sm text-slate-600">Check status, messages, and overdue deadlines.</span></Link>
    </section>
    <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <article className="panel overflow-hidden"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold text-slate-900">Recent requests</h2><p className="muted mt-1 text-xs">Latest collaboration updates</p></div><Link className="text-sm font-medium text-blue-700" href="/requests/inbox">View inbox →</Link></div>{recent.length===0?<div className="p-8 text-center"><p className="font-medium">No requests yet</p><p className="muted mt-1 text-sm">Open a collaboration workspace to create the first request.</p><Link className="mt-3 inline-block text-sm font-semibold text-blue-700" href="/partnerships">Browse collaborations</Link></div>:<div className="divide-y">{recent.map(row=>{const sent=row.sender_id===user.id;const peer=personMap[sent?row.receiver_id:row.sender_id];return <Link key={row.id} href={sent?"/requests/sent":"/requests/inbox"} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"><span className="min-w-0"><span className="block truncate font-medium text-slate-900">{row.anchor_text||"Collaboration request"}</span><span className="muted mt-1 block text-xs">{sent?"Sent to":"From"} {peer?.full_name??"Partner"} · {formatDate(row.created_at)}</span></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-700">{String(row.status).replaceAll("_"," ")}</span></Link>;})}</div>}</article>
      <article className="panel p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Today &amp; deadlines</h2><p className="muted mt-1 text-xs">Requests needing attention</p></div><Clock3 size={18} className="text-slate-500"/></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-bold">{awaitingReview}</p><p className="muted mt-1 text-xs">Waiting to be seen</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-bold">{receivedToday}</p><p className="muted mt-1 text-xs">Received today</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-bold">{sentToday}</p><p className="muted mt-1 text-xs">Sent today</p></div><div className="rounded-xl bg-red-50 p-4"><p className="text-2xl font-bold text-red-700">{overdue}</p><p className="mt-1 text-xs text-red-700">Overdue</p></div></div><Link href="/pending-overdue" className="mt-4 block text-sm font-semibold text-blue-700">Review pending &amp; overdue →</Link></article>
    </section>
    <section className="panel"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Partner workspaces</h2><p className="muted mt-1 text-xs">Requests received and sent by workspace</p></div><Link href="/partnerships" className="text-sm font-medium text-blue-700">All collaborations →</Link></div>{partnerStats.length===0?<p className="muted p-5 text-sm">No active collaboration workspaces yet. Accepting a partner invitation will create one.</p>:<div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{partnerStats.map(partner=><Link key={partner.id} href={`/partnerships/${partner.id}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50"><div className="flex items-center justify-between"><h3 className="font-semibold">{partner.name}</h3><ArrowUpRight size={15} className="text-slate-400"/></div><p className="muted mt-2 text-sm">{partner.inbound} received · {partner.outbound} sent</p></Link>)}</div>}</section>
  </main>;
}
