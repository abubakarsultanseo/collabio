begin;

alter table public.requests
  add column if not exists live_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.requests'::regclass and conname = 'requests_guest_post_live_url'
  ) then
    alter table public.requests
      add constraint requests_guest_post_live_url check (
        live_url is null or (
          request_type = 'guest_post'
          and char_length(live_url) <= 2048
          and live_url ~* '^https?://[^/?#[:space:]]+[^[:space:]]*$'
        )
      );
  end if;
end;
$$;

create or replace function public.require_guest_post_live_url()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.request_type = 'guest_post' and new.status = 'live' and new.live_url is null then
    if tg_op = 'INSERT' then
      -- Historical imports can already be Live without a published URL.
      if new.import_key is not null then return new; end if;
    elsif old.request_type = 'guest_post' and old.status = 'live' and old.live_url is null then
      return new;
    end if;
    raise exception 'Add the published article URL before marking this guest post Live.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists requests_require_guest_post_live_url on public.requests;
create trigger requests_require_guest_post_live_url
before insert or update of request_type, status, live_url on public.requests
for each row execute function public.require_guest_post_live_url();

commit;
