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
