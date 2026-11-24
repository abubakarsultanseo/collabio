"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useState} from "react";
import {Activity,ArrowLeftRight,Bell,ChevronLeft,Clock3,Inbox,LayoutDashboard,Menu,MessageSquare,Send,Settings,ShieldCheck,Users,X} from "lucide-react";

const mainItems=[
  {label:"Dashboard",href:"/dashboard",icon:LayoutDashboard},
  {label:"My Partners",href:"/partners",icon:Users},
  {label:"Partner Workspaces",href:"/partnerships",icon:ArrowLeftRight},
  {label:"Received Requests",href:"/requests/inbox",icon:Inbox},
  {label:"Sent Requests",href:"/requests/sent",icon:Send},
  {label:"Notifications",href:"/notifications",icon:Bell},
  {label:"Pending & Overdue",href:"/pending-overdue",icon:Clock3},
  {label:"Messages",href:"/messages",icon:MessageSquare},
  {label:"Monthly Reports",href:"/reports",icon:Activity},
  {label:"Activity History",href:"/activity-history",icon:Activity},
];
const adminItems=[
  {label:"Partner Permissions",href:"/permissions",icon:ShieldCheck},
  {label:"Team & Invitations",href:"/team",icon:Users},
  {label:"Settings",href:"/settings",icon:Settings},
];

export default function AppNavigation({isAdmin}:{isAdmin:boolean}){
  const path=usePathname();
  const [mobileOpen,setMobileOpen]=useState(false);
  const close=()=>setMobileOpen(false);
  function item(entry:(typeof mainItems)[number]|(typeof adminItems)[number]){
    const Icon=entry.icon;
    const active=path===entry.href||path.startsWith(entry.href+"/");
    return <Link key={entry.href} href={entry.href} onClick={close} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active?"bg-blue-50 text-blue-900":"text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon size={17} strokeWidth={1.8}/><span>{entry.label}</span></Link>;
  }
  const sidebar=<aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5">
    <Link href="/dashboard" onClick={close} className="mb-7 flex items-center gap-3 rounded-xl px-2 py-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-800"><ArrowLeftRight size={20}/></span><span><b className="block text-sm text-slate-900">Partner Collaboration</b><span className="text-xs text-slate-500">Outreach workspace</span></span></Link>
    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Main menu</p><nav className="space-y-1">{mainItems.map(item)}</nav>
    {isAdmin&&<><div className="my-4 border-t border-slate-100"/><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Administration</p><nav className="space-y-1">{adminItems.map(item)}</nav></>}
    <div className="mt-auto border-t border-slate-100 pt-4"><form action="/auth/signout" method="post"><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"><ChevronLeft size={17}/>Sign out</button></form></div>
  </aside>;
  return <>
    <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden"><Link href="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900"><ArrowLeftRight size={19}/> Partner Collaboration</Link><button aria-label={mobileOpen?"Close navigation":"Open navigation"} onClick={()=>setMobileOpen(value=>!value)} className="rounded-lg border p-2 text-slate-600">{mobileOpen?<X size={18}/>:<Menu size={18}/>}</button></div>
    <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block">{sidebar}</div>
    {mobileOpen&&<div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden" onClick={close}><div className="h-full max-h-screen w-[min(88vw,320px)]" onClick={event=>event.stopPropagation()}>{sidebar}</div></div>}
  </>;
}
