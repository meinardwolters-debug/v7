-- Exaltation app update v4
create table if not exists public.events (
  id bigint generated always as identity primary key,
  event_date date not null,
  event_type text not null check (event_type in ('repetitie', 'optreden')),
  title text,
  location text,
  active boolean default true,
  created_at timestamptz default now()
);

alter table public.attendance add column if not exists event_id bigint references public.events(id);

alter table public.attendance drop constraint if exists attendance_event_id_member_name_key;
alter table public.attendance add constraint attendance_event_id_member_name_key unique (event_id, member_name);

alter table public.members add column if not exists login_code text;
alter table public.members add column if not exists is_secretary boolean default false;
alter table public.members add column if not exists active boolean default true;

update public.members set login_code = '1234' where login_code is null;
update public.members set login_code = '1961', is_secretary = true, active = true where name = 'Meinard Wolters';

grant usage on schema public to anon;
grant select, insert, update on public.members to anon;
grant select, insert, update on public.attendance to anon;
grant select, insert, update on public.events to anon;
grant usage, select on all sequences in schema public to anon;

alter table public.members enable row level security;
alter table public.attendance enable row level security;
alter table public.events enable row level security;

drop policy if exists "members_select" on public.members;
drop policy if exists "members_insert" on public.members;
drop policy if exists "members_update" on public.members;
drop policy if exists "attendance_select" on public.attendance;
drop policy if exists "attendance_insert" on public.attendance;
drop policy if exists "attendance_update" on public.attendance;
drop policy if exists "events_select" on public.events;
drop policy if exists "events_insert" on public.events;
drop policy if exists "events_update" on public.events;

create policy "members_select" on public.members for select to anon using (true);
create policy "members_insert" on public.members for insert to anon with check (true);
create policy "members_update" on public.members for update to anon using (true) with check (true);
create policy "attendance_select" on public.attendance for select to anon using (true);
create policy "attendance_insert" on public.attendance for insert to anon with check (true);
create policy "attendance_update" on public.attendance for update to anon using (true) with check (true);
create policy "events_select" on public.events for select to anon using (true);
create policy "events_insert" on public.events for insert to anon with check (true);
create policy "events_update" on public.events for update to anon using (true) with check (true);

insert into public.events (event_date, event_type, title, location, active)
select current_date, 'repetitie', 'Repetitie vandaag', '', true
where not exists (select 1 from public.events);

insert into public.events (event_date, event_type, title, location, active)
select current_date + interval '7 days', 'repetitie', 'Repetitie', '', true
where (select count(*) from public.events) < 2;
