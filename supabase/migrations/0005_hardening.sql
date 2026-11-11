-- Mirante — endurecimento de permissões (Data API e funções SECURITY DEFINER)

-- Funções internas: não podem ser chamadas pela API pública (/rpc).
revoke execute on function public.seed_default_behaviors(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.claim_job(text) from public, anon, authenticated;
revoke execute on function public.media_due_for_deletion() from public, anon, authenticated;
grant execute on function public.claim_job(text) to service_role;
grant execute on function public.media_due_for_deletion() to service_role;

-- Funções de apoio à RLS: só para usuários autenticados (cada uma usa auth.uid()).
revoke execute on function public.current_org_id() from public, anon;
revoke execute on function public.current_role_key() from public, anon;
revoke execute on function public.has_role(text[]) from public, anon;
revoke execute on function public.meeting_in_my_org(uuid) from public, anon;
grant execute on function public.current_org_id() to authenticated, service_role;
grant execute on function public.current_role_key() to authenticated, service_role;
grant execute on function public.has_role(text[]) to authenticated, service_role;
grant execute on function public.meeting_in_my_org(uuid) to authenticated, service_role;

-- Data API: visitantes não autenticados não acessam nada; usuários logados passam pela RLS.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
