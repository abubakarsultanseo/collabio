import {requireAdmin} from "@/server/auth";
import PermissionsManager from "@/components/permissions-manager";

export default async function PermissionsPage(){
  await requireAdmin();
  return <main className="mx-auto max-w-6xl space-y-5 p-6 md:p-10"><header><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700">Administration</p><h1 className="mt-2 text-3xl font-bold">Partner Permissions</h1><p className="muted mt-2">Manage what each partner can view and change. Updates take effect immediately.</p></header><PermissionsManager/></main>;
}
