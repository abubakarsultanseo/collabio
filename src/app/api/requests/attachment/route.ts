import { NextResponse } from "next/server";
import { z } from "zod";
import { requestAttachmentBucket } from "@/lib/request-attachment";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const id = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("requestId"));
  if (!id.success) return new Response("Document not found.", { status: 404 });
  const auth = await createClient();
  const {
    data: { user },
  } = await getAuthUser(auth);
  if (!user)
    return new Response("Sign in to open this document.", { status: 401 });
  // The authenticated request read enforces active-account and workspace permissions.
  const { data, error } = await auth
    .from("requests")
    .select("attachment_path,attachment_name")
    .eq("id", id.data)
    .maybeSingle();
  if (error || !data?.attachment_path)
    return new Response("Document not found.", { status: 404 });
  const signed = await createAdminClient()
    .storage.from(requestAttachmentBucket)
    .createSignedUrl(data.attachment_path, 60, {
      download: data.attachment_name || true,
    });
  if (signed.error)
    return new Response("Could not open the document.", { status: 503 });
  return NextResponse.redirect(signed.data.signedUrl, {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
