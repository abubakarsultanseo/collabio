import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { googleAttempt, type GoogleError } from "@/lib/google-sign-in";
import { returnPath } from "@/lib/return-path";
import {
  checkGoogleAccount,
  googleCookie,
  isSameOrigin,
} from "@/server/google-sign-in";

const responseHeaders = { "Cache-Control": "no-store" };

const credentialInput = z.object({
  challenge: z.string().refine(googleAttempt),
  credential: z.string().min(1).max(12000),
  invite: z.string().min(20).max(200).optional(),
  next: z.string().max(2048).optional().transform(returnPath),
});

function challengeCookie(id: string) {
  return `collabio-google-nonce-${id}`;
}

function failure(error: GoogleError, status: number) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request) || !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
    return failure("sign_in", 403);

  const body = await request.json().catch(() => null);
  const store = await cookies();
  const options = googleCookie(request);
  if (body?.action === "challenge") {
    const id = randomUUID();
    const nonce = randomBytes(32).toString("base64url");
    store.set(challengeCookie(id), nonce, options);
    return NextResponse.json(
      { id, digest: createHash("sha256").update(nonce).digest("hex") },
      { headers: responseHeaders },
    );
  }

  const parsed = credentialInput.safeParse(body);
  if (!parsed.success) return failure("sign_in", 400);
  const { challenge, credential, invite, next } = parsed.data;
  const name = challengeCookie(challenge);
  const nonce = store.get(name)?.value;
  if (!nonce) return failure("sign_in", 400);
  store.set(name, "", { ...options, maxAge: 0 });

  let auth: Awaited<ReturnType<typeof createClient>> | undefined;
  let signedIn = false;
  try {
    auth = await createClient();
    const { data, error } = await auth.auth.signInWithIdToken({
      provider: "google",
      token: credential,
      nonce,
    });
    if (error || !data.user) {
      console.warn("Google identity exchange failed", error?.code);
      return failure("sign_in", 401);
    }
    signedIn = true;
    const denial = await checkGoogleAccount(auth, data.user, invite);
    if (denial) {
      await auth.auth.signOut({ scope: "local" });
      return failure(denial, denial === "auth_unavailable" ? 503 : 403);
    }
    return NextResponse.json({ next }, { headers: responseHeaders });
  } catch {
    if (signedIn) await auth?.auth.signOut({ scope: "local" }).catch(() => {});
    console.error("Google identity sign-in unavailable");
    return failure("auth_unavailable", 503);
  }
}
