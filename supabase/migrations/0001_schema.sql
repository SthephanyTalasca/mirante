-- Mirante — schema principal
create extension if not exists "pgcrypto";

-- ───────────────────────── Organizações e usuários ─────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default jsonb_build_object(
    'min_confidence', 0.6,
    'sample_fps', 1,
    'window_seconds', 8,
    'retention_video_days', 30,
    'retention_frames_days', 30,
    'store_reference_frames', true,
    'ai_provider', 'anthropic',
    'ai_model', null,
    'consent_policy_version', 'v1'
  ),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  full_name text,
  role text not null default 'analista' check (role in ('admin','analista','revisor','leitor')),
  created_at timestamptz not null default now()
);
create index on public.profiles(org_id);

-- ───────────────────────── Catálogo de comportamentos ─────────────────────────
create table public.behavior_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]{2,48}$'),
  name text not null,
  group_key text not null check (group_key in ('expressao','acao','engajamento')),
  detection text not null default 'visual' check (detection in ('visual','derivado')),
  metric_key text,                       -- para detection='derivado'
  description text not null default '',
  criteria text not null default '',     -- critérios de identificação enviados à IA
  min_confidence numeric(3,2) check (min_confidence between 0 and 1),
  min_frames int not null default 2 check (min_frames >= 1),
  min_duration_ms int not null default 0 check (min_duration_ms >= 0),
  merge_gap_ms int not null default 3000 check (merge_gap_ms >= 0),
  color text not null default '#5B6CFF',
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

-- ───────────────────────── Reuniões ─────────────────────────
create type public.meeting_status as enum
  ('rascunho','aguardando_configuracao','na_fila','processando','concluida','erro','expirada');

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  meeting_type text not null default 'reuniao'
    check (meeting_type in ('reuniao','apresentacao_comercial','treinamento','demonstracao','outro')),
  recorded_at timestamptz,
  video_path text,
  video_deleted_at timestamptz,
  duration_ms int,
  width int,
  height int,
  fps numeric,
  preview_frames jsonb not null default '[]',   -- [{path, t_ms}]
  no_visible_host boolean not null default false,
  status public.meeting_status not null default 'rascunho',
  progress int not null default 0 check (progress between 0 and 100),
  error text,
  settings_snapshot jsonb,
  stats jsonb not null default '{}',             -- tokens, custo, cobertura
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index on public.meetings(org_id, created_at desc);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  method text not null check (method in ('aviso_na_gravacao','termo_assinado','aceite_na_plataforma','outro')),
  policy_version text not null,
  notes text,
  attested_by uuid not null references auth.users(id),
  attested_at timestamptz not null default now()
);
create index on public.consent_records(meeting_id);

-- ───────────────────────── Participantes (por posição, sem reconhecimento facial) ─────────────────────────
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  label text not null,
  is_host boolean not null default false,
  color text not null default '#94A3B8',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.participants(meeting_id);
create unique index participants_one_host on public.participants(meeting_id) where is_host;

create table public.participant_regions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  x numeric not null check (x >= 0 and x < 1),
  y numeric not null check (y >= 0 and y < 1),
  w numeric not null check (w > 0 and x + w <= 1.0001),
  h numeric not null check (h > 0 and y + h <= 1.0001),
  start_ms int not null default 0,
  end_ms int,                                    -- null = até o fim
  check (end_ms is null or end_ms > start_ms)
);
create index on public.participant_regions(participant_id);

create table public.meeting_markers (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  t_ms int not null check (t_ms >= 0),
  label text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.meeting_markers(meeting_id, t_ms);

-- ───────────────────────── Processamento ─────────────────────────
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  kind text not null check (kind in ('preview','analysis','report')),
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index on public.processing_jobs(status, run_after);

create table public.analysis_windows (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  start_ms int not null,
  end_ms int not null,
  frame_count int not null,
  status text not null check (status in ('analisada','propagada','sem_imagem','falhou')),
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,5),
  raw_response jsonb,
  created_at timestamptz not null default now(),
  unique (meeting_id, participant_id, start_ms)
);

-- ───────────────────────── Ocorrências ─────────────────────────
create table public.occurrences (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  category_id uuid not null references public.behavior_categories(id),
  original_category_id uuid references public.behavior_categories(id),
  description text not null,
  start_ms int not null check (start_ms >= 0),
  end_ms int not null,
  duration_ms int generated always as (end_ms - start_ms) stored,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  support_frames int not null default 1,
  frame_ref_path text,
  source text not null default 'ia' check (source in ('ia','manual')),
  review_status text not null default 'pendente'
    check (review_status in ('pendente','confirmada','corrigida','rejeitada')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_ms >= start_ms)
);
create index on public.occurrences(meeting_id, start_ms);
create index on public.occurrences(participant_id);
create index on public.occurrences(category_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  version int not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (meeting_id, version)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_logs(org_id, created_at desc);

-- ───────────────────────── Barreiras de integridade ─────────────────────────

-- 1) Nunca registrar ocorrência para o host (vale até para a service role).
create or replace function public.occurrences_block_host() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.participants p where p.id = new.participant_id and p.is_host) then
    raise exception 'O host é excluído da análise: ocorrência rejeitada.';
  end if;
  if not exists (select 1 from public.participants p where p.id = new.participant_id and p.meeting_id = new.meeting_id) then
    raise exception 'Participante não pertence à reunião.';
  end if;
  return new;
end $$;
create trigger occurrences_block_host before insert or update on public.occurrences
  for each row execute function public.occurrences_block_host();

-- Ao marcar alguém como host depois, as ocorrências dele são apagadas.
create or replace function public.participants_purge_host() returns trigger
language plpgsql as $$
begin
  if new.is_host and not old.is_host then
    delete from public.occurrences where participant_id = new.id;
    delete from public.analysis_windows where participant_id = new.id;
  end if;
  return new;
end $$;
create trigger participants_purge_host after update of is_host on public.participants
  for each row execute function public.participants_purge_host();

-- 2) Não entrar na fila sem consentimento e sem definição de host.
create or replace function public.meetings_require_consent() returns trigger
language plpgsql as $$
begin
  if new.status = 'na_fila' and old.status is distinct from 'na_fila' then
    if not exists (select 1 from public.consent_records c where c.meeting_id = new.id) then
      raise exception 'Registre o consentimento antes de processar.';
    end if;
    if not new.no_visible_host and not exists
       (select 1 from public.participants p where p.meeting_id = new.id and p.is_host) then
      raise exception 'Selecione o host (ou indique que não há host visível) antes de processar.';
    end if;
    if not exists (select 1 from public.participants p
                   join public.participant_regions r on r.participant_id = p.id
                   where p.meeting_id = new.id and not p.is_host) then
      raise exception 'Defina ao menos um participante para análise.';
    end if;
  end if;
  return new;
end $$;
create trigger meetings_require_consent before update of status on public.meetings
  for each row execute function public.meetings_require_consent();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger behavior_categories_touch before update on public.behavior_categories
  for each row execute function public.touch_updated_at();

-- ───────────────────────── Fila de jobs ─────────────────────────
create or replace function public.claim_job(p_worker text)
returns setof public.processing_jobs
language plpgsql security definer set search_path = public as $$
begin
  -- recupera jobs travados há mais de 30 min (worker caiu)
  update processing_jobs set status = 'queued', locked_at = null, locked_by = null
   where status = 'running' and locked_at < now() - interval '30 minutes';

  return query
  update processing_jobs j set status = 'running', locked_at = now(), locked_by = p_worker,
         attempts = j.attempts + 1
   where j.id = (
     select id from processing_jobs
      where status = 'queued' and run_after <= now()
      order by created_at
      for update skip locked
      limit 1)
  returning j.*;
end $$;
revoke all on function public.claim_job(text) from public, anon, authenticated;
