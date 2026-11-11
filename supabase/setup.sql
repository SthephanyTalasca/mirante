-- Mirante — instalação completa do banco (as 4 migrations em sequência).
-- Supabase → SQL Editor → New query → cole tudo → Run. Rode uma única vez num projeto novo.

-- ===================== supabase/migrations/0001_schema.sql =====================
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

-- ===================== supabase/migrations/0002_security.sql =====================
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

-- ===================== supabase/migrations/0003_seed_behaviors.sql =====================
-- Mirante — catálogo padrão (editável depois pela área de administração)
create or replace function public.seed_default_behaviors(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into behavior_categories
    (org_id, code, name, group_key, detection, metric_key, description, criteria,
     min_frames, min_duration_ms, merge_gap_ms, color, sort_order)
  values
  -- Expressões faciais aparentes (sinais visuais, nunca emoções)
  (p_org,'expressao_surpresa','Expressão facial de surpresa','expressao','visual',null,
   'Sobrancelhas erguidas e olhos ou boca mais abertos que o habitual da pessoa.',
   'Sobrancelhas visivelmente elevadas E olhos arregalados ou boca entreaberta, em contraste com os quadros vizinhos. Pode ser breve.',
   1,0,2000,'#F59E0B',10),
  (p_org,'sorriso','Sorriso','expressao','visual',null,
   'Cantos da boca elevados, com ou sem dentes à mostra.',
   'Cantos da boca claramente elevados. Não confundir com fala.',
   1,0,3000,'#10B981',20),
  (p_org,'expressao_desagrado','Expressão de desagrado','expressao','visual',null,
   'Lábios comprimidos ou cantos da boca para baixo, nariz franzido.',
   'Cantos da boca voltados para baixo, lábios comprimidos ou nariz franzido de forma visível.',
   2,1000,3000,'#EF4444',30),
  (p_org,'testa_franzida','Testa franzida','expressao','visual',null,
   'Sobrancelhas aproximadas ou rugas verticais entre elas.',
   'Sobrancelhas puxadas para baixo e para o centro, com vincos visíveis na testa.',
   2,1000,3000,'#F97316',40),
  (p_org,'expressao_confusa','Expressão aparentemente confusa','expressao','visual',null,
   'Combinação de testa franzida com cabeça inclinada ou olhar estreitado.',
   'Testa franzida combinada com inclinação lateral da cabeça ou olhos semicerrados voltados para a tela.',
   2,1000,3000,'#A855F7',50),
  (p_org,'aparencia_atencao','Aparência de atenção','expressao','visual',null,
   'Rosto voltado para a tela, olhar estável, postura orientada à apresentação.',
   'Rosto frontal à câmera/tela, olhar estável e pouca movimentação lateral durante vários quadros.',
   3,4000,4000,'#3B82F6',60),
  (p_org,'expressao_neutra','Expressão neutra','expressao','visual',null,
   'Face relaxada, sem sinais marcantes.',
   'Nenhuma das demais expressões é visível; face relaxada.',
   3,5000,4000,'#94A3B8',70),

  -- Comportamentos e ações
  (p_org,'mexendo_celular','Mexendo no celular','acao','visual',null,
   'Celular visível na mão ou olhar dirigido para baixo com movimento de mãos compatível.',
   'Celular visível na mão/rosto iluminado de baixo, OU olhar fixo para baixo com mãos se movendo na altura do peito.',
   2,2000,4000,'#E11D48',110),
  (p_org,'olhando_outra_tela','Olhando para outra tela','acao','visual',null,
   'Rosto/olhar voltado de forma sustentada para um ponto lateral fora da câmera.',
   'Cabeça ou olhar virados para a lateral de forma sustentada (não um relance), sugerindo outro monitor.',
   3,3000,4000,'#DB2777',120),
  (p_org,'desviando_olhar','Desviando o olhar frequentemente','acao','visual',null,
   'Olhar alternando repetidamente entre a tela e outros pontos.',
   'Na sequência de quadros, o olhar sai e volta para a tela ao menos 3 vezes.',
   3,4000,5000,'#C026D3',130),
  (p_org,'outra_atividade','Aparentemente realizando outra atividade','acao','visual',null,
   'Ações não relacionadas à reunião: comer, digitar longamente olhando para outro lado, falar com alguém fora do quadro.',
   'Ação visível não relacionada à tela da reunião (comer, falar com alguém fora do quadro, manusear objetos).',
   3,4000,5000,'#9333EA',140),
  (p_org,'olhando_apresentacao','Olhando diretamente para a apresentação','acao','visual',null,
   'Olhar dirigido à tela de forma contínua.',
   'Olhar voltado à tela/câmera de forma contínua na maior parte dos quadros da janela.',
   3,5000,4000,'#2563EB',150),
  (p_org,'fazendo_anotacoes','Fazendo anotações','acao','visual',null,
   'Escrevendo em papel/caderno ou digitando com olhar alternando entre tela e anotação.',
   'Caneta/caderno visível com movimento de escrita, OU digitação com olhar alternando entre a tela e o teclado.',
   2,3000,5000,'#0EA5E9',160),
  (p_org,'interagindo_camera','Interagindo com a câmera','acao','visual',null,
   'Acenos, gestos de mão, polegar para cima, sinal de positivo, aproximação intencional.',
   'Gesto dirigido à câmera: aceno, polegar para cima, mão levantada, aceno de cabeça claro.',
   1,0,2000,'#14B8A6',170),
  (p_org,'saindo_enquadramento','Saindo e retornando ao enquadramento','acao','visual',null,
   'Pessoa sai total ou parcialmente do quadro e depois retorna.',
   'O rosto deixa de estar visível no quadro (cadeira vazia, só parte do corpo) em um ou mais quadros.',
   1,1000,3000,'#64748B',180),
  (p_org,'reacao_visual','Reação visual visível','acao','visual',null,
   'Mudança visual nítida em relação aos quadros anteriores (movimento súbito de cabeça, expressão marcante).',
   'Mudança brusca de postura ou expressão em relação aos quadros imediatamente anteriores.',
   1,0,2000,'#EAB308',190),

  -- Indicadores de engajamento visual (calculados, não enviados à IA)
  (p_org,'ind_atencao_visual','Atenção visual aparente','engajamento','derivado','attention_ratio',
   '% do tempo analisado com "Olhando para a apresentação" ou "Aparência de atenção".','',1,0,0,'#2563EB',210),
  (p_org,'ind_frequencia_interacao','Frequência de interação','engajamento','derivado','interaction_rate',
   'Interações com a câmera, sorrisos e reações visuais a cada 10 minutos.','',1,0,0,'#14B8A6',220),
  (p_org,'ind_mudancas_expressao','Mudanças de expressão','engajamento','derivado','expression_changes',
   'Quantidade de transições entre expressões aparentes ao longo da reunião.','',1,0,0,'#A855F7',230),
  (p_org,'ind_momentos_interacao','Momentos de maior e menor interação visual','engajamento','derivado','interaction_peaks',
   'Minutos com maior e menor concentração de ocorrências.','',1,0,0,'#F59E0B',240),
  (p_org,'ind_reacoes_marcos','Reações a acontecimentos','engajamento','derivado','marker_reactions',
   'Ocorrências até 30 s após cada marco registrado na reunião.','',1,0,0,'#EAB308',250)
  on conflict (org_id, code) do nothing;
$$;

-- ===================== supabase/migrations/0004_views_retention.sql =====================
-- Mirante — views de consulta histórica e rotina de retenção

-- Resumo por reunião (comparações entre reuniões)
create or replace view public.meeting_summary with (security_invoker = true) as
select m.id, m.org_id, m.title, m.meeting_type, m.status, m.recorded_at, m.created_at, m.duration_ms,
       (select count(*) from participants p where p.meeting_id = m.id and not p.is_host) as participants_analyzed,
       (select count(*) from occurrences o where o.meeting_id = m.id and o.review_status <> 'rejeitada') as occurrences,
       (select count(*) from occurrences o where o.meeting_id = m.id and o.review_status in ('confirmada','corrigida','rejeitada')) as reviewed
from meetings m;

-- Frequência por categoria por reunião
create or replace view public.category_frequency with (security_invoker = true) as
select o.meeting_id, o.category_id, c.code, c.name, c.color, c.group_key,
       count(*) as total, sum(o.duration_ms) as total_ms, avg(o.confidence) as avg_conf
from occurrences o join behavior_categories c on c.id = o.category_id
where o.review_status <> 'rejeitada'
group by o.meeting_id, o.category_id, c.code, c.name, c.color, c.group_key;

-- Retenção: devolve os objetos a apagar (o worker/cron apaga do Storage e chama mark_media_deleted)
create or replace function public.media_due_for_deletion()
returns table(meeting_id uuid, org_id uuid, video_path text, kind text)
language sql security definer set search_path = public as $$
  select m.id, m.org_id, m.video_path, 'video'
    from meetings m join organizations o on o.id = m.org_id
   where m.video_path is not null and m.video_deleted_at is null
     and m.created_at < now() - make_interval(days => coalesce((o.settings->>'retention_video_days')::int, 30))
  union all
  select m.id, m.org_id, null, 'frames'
    from meetings m join organizations o on o.id = m.org_id
   where exists (select 1 from occurrences oc where oc.meeting_id = m.id and oc.frame_ref_path is not null)
     and m.created_at < now() - make_interval(days => coalesce((o.settings->>'retention_frames_days')::int, 30))
$$;
revoke all on function public.media_due_for_deletion() from public, anon, authenticated;

