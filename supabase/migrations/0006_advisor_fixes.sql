-- Mirante — correções apontadas pelos alertas de segurança do Supabase

-- 1) search_path fixo nas funções de gatilho
alter function public.occurrences_block_host() set search_path = public;
alter function public.participants_purge_host() set search_path = public;
alter function public.meetings_require_consent() set search_path = public;
alter function public.touch_updated_at() set search_path = public;

-- 2) Funções de apoio à RLS saem do schema exposto pela API (não viram /rpc).
--    As políticas apontam para a função, não para o nome, e continuam valendo.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.current_org_id() set schema private;
alter function public.current_role_key() set schema private;
alter function public.has_role(text[]) set schema private;
alter function public.meeting_in_my_org(uuid) set schema private;
alter function private.meeting_in_my_org(uuid) set search_path = public, private;

-- 3) Função de gatilho de evento do Supabase (RLS automática): não precisa ser chamável pela API.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
