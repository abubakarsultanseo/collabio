import {requireAdmin} from "@/server/auth";
import InvitePartnerForm from "@/components/invite-partner-form";
import TeamAdminPanel from "@/components/team-admin-panel";

export default async function PartnersPage(){
  await requireAdmin();
  return <main className="mx-auto max-w-6xl p-6 md:p-10">
    <a href="/dashboard" className="text-sm text-blue-700">← Dashboard</a>
    <h1 className="mt-3 text-3xl font-bold">Team &amp; Invitations</h1>
    <p className="muted mt-2">Invite teammates, review invitation status, and manage account access.</p>
    <section className="panel mt-6 p-5 md:p-6"><h2 className="mb-4 font-semibold">Invite a team member</h2><InvitePartnerForm/></section>
    <div className="mt-6"><TeamAdminPanel/></div>
  </main>;
}
