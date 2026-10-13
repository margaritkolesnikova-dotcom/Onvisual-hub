-- ONVISUAL HUB · персональные кабинеты сотрудников
-- Запустить один раз в SQL Editor проекта Supabase.
create extension if not exists pgcrypto;

create table if not exists public.hub_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null default 'viewer' check (role in ('admin','producer','creative','editor','creator','smm','viewer')),
  sections text[] not null default array['tasks','calendar','files']::text[],
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.hub_is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.hub_profiles
    where id = (select auth.uid()) and role = 'admin' and active
  );
$$;

create or replace function public.hub_is_active()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.hub_profiles
                 where id = (select auth.uid()) and active);
$$;

create table if not exists public.hub_tasks (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  assigned_to uuid not null references public.hub_profiles(id),
  created_by uuid references public.hub_profiles(id),
  title text not null check (length(trim(title)) between 1 and 220),
  details text not null default '',
  scope text not null default 'ONVISUAL',
  category text not null default 'Монтаж',
  status text not null default 'new'
    check (status in ('new','progress','review','done')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high')),
  due_at date,
  reference_url text,
  result_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.hub_tasks(id) on delete cascade,
  actor_id uuid not null references public.hub_profiles(id),
  message text not null check (length(trim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create or replace function public.hub_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hub_tasks_touch on public.hub_tasks;
create trigger hub_tasks_touch
before update on public.hub_tasks
for each row execute function public.hub_touch_updated_at();

alter table public.hub_profiles enable row level security;
alter table public.hub_tasks enable row level security;
alter table public.hub_task_activity enable row level security;

drop policy if exists hub_profiles_read on public.hub_profiles;
create policy hub_profiles_read on public.hub_profiles
for select to authenticated
using (id = (select auth.uid()) or (select public.hub_is_admin()));

drop policy if exists hub_profiles_admin_insert on public.hub_profiles;
create policy hub_profiles_admin_insert on public.hub_profiles
for insert to authenticated with check ((select public.hub_is_admin()));

drop policy if exists hub_profiles_admin_update on public.hub_profiles;
create policy hub_profiles_admin_update on public.hub_profiles
for update to authenticated using ((select public.hub_is_admin()))
with check ((select public.hub_is_admin()));

drop policy if exists hub_tasks_read on public.hub_tasks;
create policy hub_tasks_read on public.hub_tasks
for select to authenticated
using ((select public.hub_is_admin()) or
       (assigned_to = (select auth.uid()) and (select public.hub_is_active())));

drop policy if exists hub_tasks_admin_create on public.hub_tasks;
create policy hub_tasks_admin_create on public.hub_tasks
for insert to authenticated
with check ((select public.hub_is_admin()));

drop policy if exists hub_tasks_admin_edit on public.hub_tasks;
create policy hub_tasks_admin_edit on public.hub_tasks
for update to authenticated using ((select public.hub_is_admin()))
with check ((select public.hub_is_admin()));

drop policy if exists hub_tasks_admin_delete on public.hub_tasks;
create policy hub_tasks_admin_delete on public.hub_tasks
for delete to authenticated using ((select public.hub_is_admin()));

drop policy if exists hub_activity_read on public.hub_task_activity;
create policy hub_activity_read on public.hub_task_activity
for select to authenticated
using ((select public.hub_is_admin()) or exists (
  select 1 from public.hub_tasks t where t.id = task_id and
     t.assigned_to = (select auth.uid()) and (select public.hub_is_active())
));

drop policy if exists hub_activity_write on public.hub_task_activity;
create policy hub_activity_write on public.hub_task_activity
for insert to authenticated
with check (actor_id = (select auth.uid()) and
  (select public.hub_is_active()) and (
    (select public.hub_is_admin()) or exists (
      select 1 from public.hub_tasks t
      where t.id = task_id and t.assigned_to = (select auth.uid())
    )
  ));

-- Исполнитель не получает прямого UPDATE на задачи.
-- Менять можно ТОЛЬКО статус и ссылку на результат через эту функцию.
create or replace function public.hub_update_own_task(
  p_task_id uuid, p_status text, p_result_url text default null
)
returns public.hub_tasks language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  target public.hub_tasks;
begin
  if (select auth.uid()) is null or not public.hub_is_active() then
    raise exception 'Access denied';
  end if;
  if p_status not in ('new','progress','review','done') then
    raise exception 'Invalid status';
  end if;
  if p_result_url is not null and length(p_result_url) > 1000 then
    raise exception 'Result URL too long';
  end if;
  if p_result_url is not null and length(trim(p_result_url)) > 0
    and p_result_url !~* '^https://[^[:space:]]+$' then
    raise exception 'HTTPS link required';
  end if;
  select * into target from public.hub_tasks where id = p_task_id for update;
  if not found or (target.assigned_to <> (select auth.uid())
                    and not public.hub_is_admin()) then
    raise exception 'Access denied';
  end if;
  update public.hub_tasks
    set status=p_status, result_url=nullif(trim(coalesce(p_result_url,'')),'')
    where id=p_task_id returning * into target;
  return target;
end;
$$;

revoke all on function public.hub_update_own_task(uuid,text,text) from public, anon;
grant execute on function public.hub_update_own_task(uuid,text,text) to authenticated;

revoke all on function public.hub_is_admin() from public, anon;
revoke all on function public.hub_is_active() from public, anon;
grant execute on function public.hub_is_admin(), public.hub_is_active() to authenticated;

grant select, insert, update on public.hub_profiles to authenticated;
grant select, insert, update, delete on public.hub_tasks to authenticated;
grant select, insert on public.hub_task_activity to authenticated;

create index if not exists hub_tasks_assigned_status on public.hub_tasks(assigned_to,status);
create index if not exists hub_activity_task_date on public.hub_task_activity(task_id,created_at);

-- Первого администратора добавить вручную ПОСЛЕ приглашения его email
-- в Supabase Authentication > Users. Замените email, не используйте
-- новый случайный UUID:
--
-- insert into public.hub_profiles (id,email,display_name,role,sections)
-- select id,email,'Администратор','admin',
--   array['tasks','calendar','files','production','creative','social','team']
-- from auth.users where email = 'admin@example.com'
-- on conflict (id) do update
-- set role='admin',active=true,
--     sections=excluded.sections;
