import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";

export default async function Home() {
  await requireUser();
  redirect("/dashboard");
}
