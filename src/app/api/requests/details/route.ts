import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();
const noteInput = z.object({
  requestId: uuid,
  body: z.string().trim().min(1).max(5000),
});

async function requestContext(requestId: string) {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user)
    return {
      response: NextResponse.json(
        { error: "Sign in to continue." },
        { status: 401 },
      ),
    } as const;
  const { data: profile, error: profileError } = await auth
    .from("profiles")
    .select("full_name,account_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.account_status !== "active")
    return {
      response: NextResponse.json(
        { error: "Active account required." },
        { status: 403 },
      ),
    } as const;

  const { data: request, error } = await auth
    .from("requests")
    .select("id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!request)
    return {
      response: NextResponse.json(
        { error: "Request unavailable." },
        { status: 404 },
      ),
    } as const;

  return { user, profile, db: createAdminClient() } as const;
}

async function allRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  const size = 100;
  for (let start = 0; ; start += size) {
    const { data, error } = await fetchPage(start, start + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < size) return rows;
  }
}

export async function GET(request: Request) {
  try {
    const id = uuid.safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success)
      return NextResponse.json({ error: "Choose a request." }, { status: 400 });
    const context = await requestContext(id.data);
    if ("response" in context) return context.response;

    const [notes, history] = await Promise.all([
      allRows((from, to) =>
        context.db
          .from("request_notes")
          .select("id,author_id,body,created_at")
          .eq("request_id", id.data)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ),
      allRows((from, to) =>
        context.db
          .from("request_activity")
          .select("id,actor_id,previous_value,new_value,created_at")
          .eq("request_id", id.data)
          .eq("action_type", "status_changed")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ),
    ]);

    const actorIds = [
      ...new Set(
        [
          ...notes.map((note) => note.author_id),
          ...history.map((change) => change.actor_id),
        ].filter(Boolean),
      ),
    ];
    const names = new Map<string, string>();
    for (let start = 0; start < actorIds.length; start += 100) {
      const { data, error } = await context.db
        .from("profiles")
        .select("id,full_name")
        .in("id", actorIds.slice(start, start + 100));
      if (error) throw error;
      for (const profile of data ?? [])
        names.set(profile.id, profile.full_name);
    }
    return NextResponse.json({
      notes: notes.map((note) => ({
        ...note,
        author: names.get(note.author_id) ?? "Former member",
      })),
      history: history.map((change) => ({
        id: change.id,
        author:
          typeof change.new_value?.actor_name === "string"
            ? change.new_value.actor_name
            : (names.get(change.actor_id) ?? "Former member"),
        created_at: change.created_at,
        from: change.previous_value?.status ?? null,
        to: change.new_value?.status ?? null,
        reason: change.new_value?.reason ?? null,
      })),
    });
  } catch (error) {
    console.error("Request details failed", error);
    return NextResponse.json(
      { error: "Could not load request notes and status history." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const parsed = noteInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "Enter a note of up to 5,000 characters." },
        { status: 400 },
      );
    const context = await requestContext(parsed.data.requestId);
    if ("response" in context) return context.response;
    const { data, error } = await context.db
      .from("request_notes")
      .insert({
        request_id: parsed.data.requestId,
        author_id: context.user.id,
        body: parsed.data.body,
      })
      .select("id,body,created_at")
      .single();
    if (error) throw error;
    return NextResponse.json(
      { note: { ...data, author: context.profile.full_name } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Request note failed", error);
    return NextResponse.json(
      { error: "Could not save the note." },
      { status: 500 },
    );
  }
}
