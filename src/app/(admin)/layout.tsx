import AppNavigation from "@/components/app-navigation";
import {requireUser} from "@/server/auth";
import {getProfile} from "@/server/profile";
export default async function WorkspaceLayout({children}:{children:React.ReactNode}){const user=await requireUser();const profile=await getProfile(user.id);return <><AppNavigation isAdmin={profile?.role==="admin"}/><div className="min-h-screen pb-16 lg:ml-60 lg:pb-0">{children}</div></>}
