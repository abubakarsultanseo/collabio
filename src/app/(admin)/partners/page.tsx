import {requireUser} from "@/server/auth";
import {getProfile} from "@/server/profile";
import SeoPartnersWorkspace from "@/components/seo-partners-workspace";

export default async function PartnersPage(){
  const user=await requireUser();
  const profile=await getProfile(user.id);
  return <SeoPartnersWorkspace isAdmin={profile?.role==="admin"} currentUserId={user.id}/>;
}
