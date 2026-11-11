-- Teste local das regras do banco (Postgres puro, sem Supabase). Rode: shim + migrations + este arquivo.
\set ON_ERROR_STOP 0
-- cadastro cria org admin + catálogo
insert into auth.users(id,email,raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111','a@x.com','{"org_name":"Org A","full_name":"Ana"}');
insert into auth.users(id,email,raw_user_meta_data) values ('22222222-2222-2222-2222-222222222222','b@y.com','{"org_name":"Org B"}');
select 'catalogo', count(*) from behavior_categories c join profiles p on p.org_id=c.org_id where p.id='11111111-1111-1111-1111-111111111111';
-- convite entra na org A como revisor
insert into org_invites(org_id,email,role) select org_id,'r@x.com','revisor' from profiles where id='11111111-1111-1111-1111-111111111111';
insert into auth.users(id,email) values ('33333333-3333-3333-3333-333333333333','R@x.com');
select 'convite', p.role, p.org_id = (select org_id from profiles where id='11111111-1111-1111-1111-111111111111') from profiles p where id='33333333-3333-3333-3333-333333333333';

-- como usuária A (RLS)
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into meetings(org_id,title,video_path) select current_org_id(),'Demo','x' returning id \gset m_
insert into participants(meeting_id,label,is_host) values (:'m_id','Host',true) returning id \gset h_
insert into participants(meeting_id,label) values (:'m_id','P1') returning id \gset p_
insert into participant_regions(participant_id,x,y,w,h) values (:'p_id',0.5,0,0.5,0.5);
\echo '--- esperado: erro de consentimento'
update meetings set status='na_fila' where id=:'m_id';
insert into consent_records(meeting_id,method,policy_version,attested_by) values (:'m_id','termo_assinado','v1','11111111-1111-1111-1111-111111111111');
update meetings set status='na_fila' where id=:'m_id';
select 'status', status from meetings where id=:'m_id';
\echo '--- esperado: segundo host recusado'
insert into participants(meeting_id,label,is_host) values (:'m_id','Host2',true);
-- usuária B não vê nada da A
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'B ve reunioes de A', count(*) from meetings where id=:'m_id';
select 'B ve catalogo de A', count(*) from behavior_categories where org_id <> current_org_id();
reset role;
\echo '--- esperado: ocorrência do host recusada (mesmo sem RLS)'
insert into occurrences(meeting_id,participant_id,category_id,description,start_ms,end_ms,confidence)
  select :'m_id', :'h_id', id, 'x', 0, 1000, .9 from behavior_categories where code='sorriso' and org_id=(select org_id from meetings where id=:'m_id');
insert into occurrences(meeting_id,participant_id,category_id,description,start_ms,end_ms,confidence)
  select :'m_id', :'p_id', id, 'x', 0, 1000, .9 from behavior_categories where code='sorriso' and org_id=(select org_id from meetings where id=:'m_id');
select 'ocorrencias P1', count(*) from occurrences;
\echo '--- marcar P1 como host apaga as ocorrências dele'
update participants set is_host=false where id=:'h_id';
update participants set is_host=true where id=:'p_id';
select 'ocorrencias apos virar host', count(*) from occurrences;
-- fila
insert into processing_jobs(meeting_id,kind) values (:'m_id','analysis');
set role service_role; select 'claim', kind, status, attempts from claim_job('w1'); select 'claim vazio', count(*) from claim_job('w2'); reset role;
select 'summary', title, participants_analyzed, occurrences from meeting_summary;
