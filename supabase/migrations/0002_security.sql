-- Mirante — RLS, papéis, onboarding e storage

-- ───────────────────────── Helpers ─────────────────────────
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function public.current_role_key() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = any(roles) from profiles where id = auth.uid()), false)
$$;

create or replace function public.meeting_in_my_org(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from meetings where id = m and org_id = current_org_id())
$$;

-- ───────────────────────── Convites e criação de conta ─────────────────────────
create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','analista','revisor','leitor')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv org_invites%rowtype;
  new_org uuid;
begin
  select * into inv from org_invites where lower(email) = lower(new.email) order by created_at desc limit 1;
  if found then
    insert into profiles(id, org_id, full_name, role)
      values (new.id, inv.org_id, new.raw_user_meta_data->>'full_name', inv.role);
    delete from org_invites where id = inv.id;
  else
    insert into organizations(name)
      values (coalesce(nullif(new.raw_user_meta_data->>'org_name', ''), 'Minha organização'))
      returning id into new_org;
    insert into profiles(id, org_id, full_name, role)
      values (new.id, new_org, new.raw_user_meta_data->>'full_name', 'admin');
    perform seed_default_behaviors(new_org);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── RLS ─────────────────────────
alter table public.organizations       enable row level security;
alter table public.profiles            enable row level security;
alter table public.org_invites         enable row level security;
alter table public.behavior_categories enable row level security;
alter table public.meetings            enable row level security;
alter table public.consent_records     enable row level security;
alter table public.participants        enable row level security;
alter table public.participant_regions enable row level security;
alter table public.meeting_markers     enable row level security;
alter table public.processing_jobs     enable row level security;
alter table public.analysis_windows    enable row level security;
alter table public.occurrences         enable row level security;
alter table public.reports             enable row level security;
alter table public.audit_logs          enable row level security;

-- organizações
create policy org_read on public.organizations for select using (id = current_org_id());
create policy org_admin_update on public.organizations for update
  using (id = current_org_id() and has_role(array['admin']));

-- perfis
create policy profiles_read on public.profiles for select using (org_id = current_org_id());
create policy profiles_admin on public.profiles for update
  using (org_id = current_org_id() and has_role(array['admin']))
  with check (org_id = current_org_id());
create policy profiles_admin_delete on public.profiles for delete
  using (org_id = current_org_id() and has_role(array['admin']) and id <> auth.uid());

create policy invites_admin on public.org_invites for all
  using (org_id = current_org_id() and has_role(array['admin']))
  with check (org_id = current_org_id() and has_role(array['admin']));

-- catálogo
create policy cat_read on public.behavior_categories for select using (org_id = current_org_id());
create policy cat_write on public.behavior_categories for all
  using (org_id = current_org_id() and has_role(array['admin']))
  with check (org_id = current_org_id() and has_role(array['admin']));

-- reuniões
create policy meet_read on public.meetings for select using (org_id = current_org_id());
create policy meet_insert on public.meetings for insert
  with check (org_id = current_org_id() and has_role(array['admin','analista']));
create policy meet_update on public.meetings for update
  using (org_id = current_org_id() and has_role(array['admin','analista']))
  with check (org_id = current_org_id());
create policy meet_delete on public.meetings for delete
  using (org_id = current_org_id() and has_role(array['admin']));

-- tabelas filhas de reunião
create policy consent_read on public.consent_records for select using (meeting_in_my_org(meeting_id));
create policy consent_insert on public.consent_records for insert
  with check (meeting_in_my_org(meeting_id) and attested_by = auth.uid() and has_role(array['admin','analista']));

create policy part_read on public.participants for select using (meeting_in_my_org(meeting_id));
create policy part_write on public.participants for all
  using (meeting_in_my_org(meeting_id) and has_role(array['admin','analista']))
  with check (meeting_in_my_org(meeting_id));

create policy reg_read on public.participant_regions for select
  using (exists (select 1 from participants p where p.id = participant_id and meeting_in_my_org(p.meeting_id)));
create policy reg_write on public.participant_regions for all
  using (has_role(array['admin','analista']) and exists (select 1 from participants p where p.id = participant_id and meeting_in_my_org(p.meeting_id)))
  with check (exists (select 1 from participants p where p.id = participant_id and meeting_in_my_org(p.meeting_id)));

create policy mark_read on public.meeting_markers for select using (meeting_in_my_org(meeting_id));
create policy mark_write on public.meeting_markers for all
  using (meeting_in_my_org(meeting_id) and has_role(array['admin','analista','revisor']))
  with check (meeting_in_my_org(meeting_id));

create policy jobs_read on public.processing_jobs for select using (meeting_in_my_org(meeting_id));
create policy jobs_insert on public.processing_jobs for insert
  with check (meeting_in_my_org(meeting_id) and has_role(array['admin','analista']));

create policy win_read on public.analysis_windows for select using (meeting_in_my_org(meeting_id));

create policy occ_read on public.occurrences for select using (meeting_in_my_org(meeting_id));
create policy occ_review on public.occurrences for update
  using (meeting_in_my_org(meeting_id) and has_role(array['admin','analista','revisor']))
  with check (meeting_in_my_org(meeting_id));
create policy occ_manual on public.occurrences for insert
  with check (meeting_in_my_org(meeting_id) and source = 'manual' and has_role(array['admin','analista','revisor']));

create policy rep_read on public.reports for select using (meeting_in_my_org(meeting_id));

create policy audit_read on public.audit_logs for select
  using (org_id = current_org_id() and has_role(array['admin']));
create policy audit_insert on public.audit_logs for insert
  with check (org_id = current_org_id() and actor = auth.uid());

-- ───────────────────────── Storage (buckets privados) ─────────────────────────
-- Caminho: {org_id}/{meeting_id}/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('recordings', 'recordings', false, 5368709120),   -- 5 GB
       ('frames', 'frames', false, 10485760)
on conflict (id) do nothing;

create policy rec_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings'
              and (storage.foldername(name))[1] = current_org_id()::text
              and has_role(array['admin','analista']));
create policy rec_read on storage.objects for select to authenticated
  using (bucket_id in ('recordings','frames')
         and (storage.foldername(name))[1] = current_org_id()::text);
create policy rec_delete on storage.objects for delete to authenticated
  using (bucket_id in ('recordings','frames')
         and (storage.foldername(name))[1] = current_org_id()::text
         and has_role(array['admin']));
