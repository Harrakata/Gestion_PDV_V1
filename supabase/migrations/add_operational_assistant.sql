-- Un compteur par utilisateur, sans contenu des conversations.
create table if not exists public.assistant_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  request_count integer not null default 0
);
alter table public.assistant_request_limits enable row level security;
revoke all on public.assistant_request_limits from anon, authenticated;

create or replace function public.consume_assistant_request()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  allowed_user uuid;
begin
  if caller is null then return false; end if;
  insert into public.assistant_request_limits as limits (user_id, window_start, request_count)
    values (caller, now(), 1)
    on conflict (user_id) do update
      set window_start = case when limits.window_start <= now() - interval '10 minutes' then now() else limits.window_start end,
          request_count = case when limits.window_start <= now() - interval '10 minutes' then 1 else limits.request_count + 1 end
      where limits.window_start <= now() - interval '10 minutes' or limits.request_count < 20
    returning user_id into allowed_user;
  return allowed_user is not null;
end;
$$;
revoke all on function public.consume_assistant_request() from public, anon;
grant execute on function public.consume_assistant_request() to authenticated;
