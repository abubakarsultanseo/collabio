import Link from "next/link";
import { AuthCard } from "@/components/app/auth-card";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <AuthCard
      title="Your outreach workspace"
      description="Manage partner invitations, permissions, and private collaboration workspaces."
    >
      <Link href="/login" className={buttonVariants()}>
        Sign in
      </Link>
    </AuthCard>
  );
}
