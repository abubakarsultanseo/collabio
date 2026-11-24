"use client";
import {useCallback,useEffect,useMemo,useState} from "react";

type Partner={id:string;owner_id:string;name:string;website_url:string;domain_rating:number|null;organic_traffic:number|null;email:string|null;contact_person:string|null;niche:string|null;country:string|null;notes:string|null;status:"prospect"|"contacted"|"active"|"inactive";created_at:string;updated_at:string;owner:{full_name:string;email:string}|null};
type TeamMember={id:string;full_name:string;email:string;role:string;account_status:string};
type FormValues={name:string;websiteUrl:string;domainRating:string;organicTraffic:string;email:string;contactPerson:string;niche:string;country:string;notes:string;status:Partner["status"];ownerId:string};
const blank:FormValues={name:"",websiteUrl:"",domainRating:"",organicTraffic:"",email:"",contactPerson:"",niche:"",country:"",notes:"",status:"prospect",ownerId:""};
const statuses:Partner["status"][]=["prospect","contacted","active","inactive"];

function numberLabel(value:number|null,format=false){if(value===null)return "—";return format?new Intl.NumberFormat().format(value):String(value);}
function dateLabel(value:string){return new Intl.DateTimeFormat("en-PK",{dateStyle:"medium",timeZone:"Asia/Karachi"}).format(new Date(value));}

export default function SeoPartnersWorkspace({isAdmin,currentUserId}:{isAdmin:boolean;currentUserId:string}){
  const [partners,setPartners]=useState<Partner[]>([]);
  const [members,setMembers]=useState<TeamMember[]>([]);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("");
  const [ownerFilter,setOwnerFilter]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [editing,setEditing]=useState<Partner|null>(null);
  const [form,setForm]=useState<FormValues>(blank);
  const [modalOpen,setModalOpen]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState<Partner|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const params=new URLSearchParams();if(search.trim())params.set("q",search.trim());if(statusFilter)params.set("status",statusFilter);if(isAdmin&&ownerFilter)params.set("ownerId",ownerFilter);
      const response=await fetch(`/api/seo-partners?${params.toString()}`,{cache:"no-store"});
      const data=await response.json();if(!response.ok)throw new Error(data.error??"Could not load partners.");setPartners(data.partners??[]);
    }catch(caught){setError(caught instanceof Error?caught.message:"Could not load partners.");}
    finally{setLoading(false);}
  },[search,statusFilter,ownerFilter,isAdmin]);

  useEffect(()=>{const timer=window.setTimeout(()=>void load(),250);return()=>window.clearTimeout(timer);},[load]);
  useEffect(()=>{if(!isAdmin)return;fetch("/api/team",{cache:"no-store"}).then(async response=>{const data=await response.json();if(response.ok)setMembers(data.members??[]);}).catch(()=>{});},[isAdmin]);

  const activeMembers=useMemo(()=>members.filter(member=>member.account_status==="active"),[members]);
  function openNew(){setEditing(null);setForm({...blank,ownerId:currentUserId});setError("");setModalOpen(true);}
  function openEdit(partner:Partner){setEditing(partner);setForm({name:partner.name,websiteUrl:partner.website_url,domainRating:partner.domain_rating===null?"":String(partner.domain_rating),organicTraffic:partner.organic_traffic===null?"":String(partner.organic_traffic),email:partner.email??"",contactPerson:partner.contact_person??"",niche:partner.niche??"",country:partner.country??"",notes:partner.notes??"",status:partner.status,ownerId:partner.owner_id});setError("");setModalOpen(true);}
  function setValue<K extends keyof FormValues>(key:K,value:FormValues[K]){setForm(previous=>({...previous,[key]:value}));}

  async function save(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setSaving(true);setError("");setNotice("");
    const payload={name:form.name,websiteUrl:form.websiteUrl,domainRating:form.domainRating===""?null:Number(form.domainRating),organicTraffic:form.organicTraffic===""?null:Number(form.organicTraffic),email:form.email,contactPerson:form.contactPerson,niche:form.niche,country:form.country,notes:form.notes,status:form.status,...(isAdmin&&!editing?{ownerId:form.ownerId||currentUserId}:{})};
    try{
      const response=await fetch(editing?`/api/seo-partners/${editing.id}`:"/api/seo-partners",{method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json();if(!response.ok)throw new Error(data.error??"Could not save partner.");
      setModalOpen(false);setNotice(editing?"Partner details updated.":"Partner added.");await load();
    }catch(caught){setError(caught instanceof Error?caught.message:"Could not save partner.");}
    finally{setSaving(false);}
  }

  async function remove(partner:Partner){
    setSaving(true);setError("");setNotice("");
    try{const response=await fetch(`/api/seo-partners/${partner.id}`,{method:"DELETE"});const data=await response.json();if(!response.ok)throw new Error(data.error??"Could not delete partner.");setConfirmDelete(null);setNotice(`${partner.name} was removed.`);await load();}
    catch(caught){setError(caught instanceof Error?caught.message:"Could not delete partner.");setConfirmDelete(null);}
    finally{setSaving(false);}
  }

  return <main className="mx-auto max-w-6xl p-6 md:p-10">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Outreach CRM</p><h1 className="mt-2 text-3xl font-bold">SEO Partners</h1><p className="muted mt-2">Keep your outreach contacts, website metrics, and relationship status in one place.</p></div><button onClick={openNew} className="primary">+ Add partner</button></div>
    {(notice||error)&&<p role="status" className={`mt-5 rounded-lg px-4 py-3 text-sm ${error?"bg-red-50 text-red-800":"bg-emerald-50 text-emerald-800"}`}>{error||notice}</p>}
    <section className="panel mt-6 p-4 md:p-5"><div className={`grid gap-3 ${isAdmin?"md:grid-cols-3":"md:grid-cols-2"}`}>
      <label className="text-sm font-medium">Search partners<input value={search} onChange={event=>setSearch(event.target.value)} className="field mt-1" placeholder="Name, website, email, niche…"/></label>
      <label className="text-sm font-medium">Status<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} className="field mt-1"><option value="">All statuses</option>{statuses.map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label>
      {isAdmin&&<label className="text-sm font-medium">Workspace<select value={ownerFilter} onChange={event=>setOwnerFilter(event.target.value)} className="field mt-1"><option value="">All team members</option>{activeMembers.map(member=><option key={member.id} value={member.id}>{member.full_name} · {member.email}</option>)}</select></label>}
    </div><div className="muted mt-3 text-xs">{loading?"Updating results…":`${partners.length} ${partners.length===1?"partner":"partners"}`}</div></section>
    {loading&&partners.length===0?<div className="panel muted mt-5 p-8 text-center text-sm">Loading partners…</div>:partners.length===0?<div className="panel mt-5 p-10 text-center"><h2 className="font-semibold">No partners found</h2><p className="muted mt-2 text-sm">Add a partner or adjust your search and filters.</p><button onClick={openNew} className="primary mt-4">Add your first partner</button></div>:<div className="mt-5 grid gap-4 lg:grid-cols-2">{partners.map(partner=><article key={partner.id} className="panel p-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-semibold">{partner.name}</h2><a href={partner.website_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm text-blue-700">{partner.website_url}</a></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs capitalize ${partner.status==="active"?"bg-emerald-50 text-emerald-800":partner.status==="inactive"?"bg-slate-100 text-slate-600":partner.status==="contacted"?"bg-blue-50 text-blue-800":"bg-amber-50 text-amber-800"}`}>{partner.status}</span></div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><div><span className="muted block text-xs">Domain Rating</span><span className="font-medium">{numberLabel(partner.domain_rating)}</span></div><div><span className="muted block text-xs">Organic traffic</span><span className="font-medium">{numberLabel(partner.organic_traffic,true)}</span></div><div><span className="muted block text-xs">Niche</span><span className="font-medium">{partner.niche||"—"}</span></div><div><span className="muted block text-xs">Country</span><span className="font-medium">{partner.country||"—"}</span></div><div><span className="muted block text-xs">Contact</span><span className="font-medium">{partner.contact_person||"—"}</span></div><div><span className="muted block text-xs">Email</span><span className="break-all font-medium">{partner.email||"—"}</span></div></div>
      {partner.notes&&<p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{partner.notes}</p>}
      <div className="muted mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs"><span>Added {dateLabel(partner.created_at)}{isAdmin&&partner.owner?` · ${partner.owner.full_name}`:""}</span><span className="flex gap-2"><button onClick={()=>openEdit(partner)} className="rounded-lg border px-3 py-1.5 text-sm text-slate-700">Edit</button><button onClick={()=>setConfirmDelete(partner)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700">Delete</button></span></div>
    </article>)}</div>}

    {modalOpen&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-3" onMouseDown={event=>{if(event.target===event.currentTarget)setModalOpen(false);}}><section role="dialog" aria-modal="true" aria-labelledby="partner-form-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl md:p-7"><div className="flex items-start justify-between gap-4"><div><h2 id="partner-form-title" className="text-xl font-bold">{editing?"Edit partner":"Add SEO partner"}</h2><p className="muted mt-1 text-sm">Partner details stay inside the assigned workspace.</p></div><button type="button" onClick={()=>setModalOpen(false)} aria-label="Close form" className="rounded-lg px-2 py-1 text-xl text-slate-500">×</button></div>
      <form onSubmit={save} className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium">Partner name *<input required minLength={2} maxLength={160} value={form.name} onChange={event=>setValue("name",event.target.value)} className="field mt-1" placeholder="Example Publishing"/></label>
        <label className="text-sm font-medium">Website URL *<input required type="url" value={form.websiteUrl} onChange={event=>setValue("websiteUrl",event.target.value)} className="field mt-1" placeholder="https://example.com"/></label>
        <label className="text-sm font-medium">Domain Rating (0–100)<input type="number" min="0" max="100" step="0.01" value={form.domainRating} onChange={event=>setValue("domainRating",event.target.value)} className="field mt-1" placeholder="e.g. 45"/></label>
        <label className="text-sm font-medium">Organic traffic<input type="number" min="0" step="1" value={form.organicTraffic} onChange={event=>setValue("organicTraffic",event.target.value)} className="field mt-1" placeholder="Monthly estimate"/></label>
        <label className="text-sm font-medium">Email<input type="email" value={form.email} onChange={event=>setValue("email",event.target.value)} className="field mt-1" placeholder="editor@example.com"/></label>
        <label className="text-sm font-medium">Contact person<input maxLength={160} value={form.contactPerson} onChange={event=>setValue("contactPerson",event.target.value)} className="field mt-1" placeholder="Name"/></label>
        <label className="text-sm font-medium">Niche<input maxLength={160} value={form.niche} onChange={event=>setValue("niche",event.target.value)} className="field mt-1" placeholder="Marketing, SaaS, HR…"/></label>
        <label className="text-sm font-medium">Country<input maxLength={120} value={form.country} onChange={event=>setValue("country",event.target.value)} className="field mt-1" placeholder="Country"/></label>
        <label className="text-sm font-medium">Status<select value={form.status} onChange={event=>setValue("status",event.target.value as Partner["status"])} className="field mt-1">{statuses.map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label>
        {isAdmin&&!editing&&<label className="text-sm font-medium">Workspace owner<select value={form.ownerId} onChange={event=>setValue("ownerId",event.target.value)} className="field mt-1"><option value={currentUserId}>My workspace</option>{activeMembers.filter(member=>member.id!==currentUserId).map(member=><option key={member.id} value={member.id}>{member.full_name}</option>)}</select></label>}
        <label className="text-sm font-medium md:col-span-2">Notes<textarea maxLength={5000} rows={4} value={form.notes} onChange={event=>setValue("notes",event.target.value)} className="field mt-1" placeholder="Outreach history, placement preferences, or other useful context"/></label>
        {error&&<p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 md:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 md:col-span-2"><button type="button" onClick={()=>setModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="primary disabled:opacity-60">{saving?"Saving…":editing?"Save changes":"Add partner"}</button></div>
      </form>
    </section></div>}

    {confirmDelete&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-lg font-bold">Delete {confirmDelete.name}?</h2><p className="muted mt-2 text-sm">This permanently removes this partner from its workspace.</p>{error&&<p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button onClick={()=>setConfirmDelete(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={saving} onClick={()=>void remove(confirmDelete)} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving?"Deleting…":"Delete partner"}</button></div></section></div>}
  </main>;
}
