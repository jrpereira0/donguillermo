-- Comissões: resumo por barbeiro no período, agregado no banco (nada de varrer comandas no cliente).
-- Produção vem das comandas FECHADAS do período (itens por barbeiro), gorjetas das
-- gorjetas lançadas por barbeiro, e atendimentos dos agendamentos concluídos.
-- A unidade vem sempre do parâmetro conferido pela action/RLS — nunca do navegador solto.

create or replace function public.commission_summary(p_unit uuid, p_from timestamptz, p_to timestamptz)
returns table (
  barber_id uuid,
  services_cents bigint,
  products_cents bigint,
  tickets_count bigint,
  appointments_done bigint,
  tips_cents bigint
)
language sql
security invoker
set search_path = ''
stable
as $$
  with closed as (
    select t.id
    from public.tickets t
    where t.unit_id = p_unit
      and t.status = 'fechada'
      and t.closed_at >= p_from
      and t.closed_at < p_to
  ),
  items as (
    select
      i.barber_id,
      sum(case when i.kind = 'servico' then i.quantity * i.unit_price_cents else 0 end)::bigint as services_cents,
      sum(case when i.kind = 'produto' then i.quantity * i.unit_price_cents else 0 end)::bigint as products_cents,
      count(distinct i.ticket_id)::bigint as tickets_count
    from public.ticket_items i
    join closed c on c.id = i.ticket_id
    where i.unit_id = p_unit and i.barber_id is not null
    group by i.barber_id
  ),
  tips as (
    select tt.barber_id, sum(tt.amount_cents)::bigint as tips_cents
    from public.ticket_tips tt
    join closed c on c.id = tt.ticket_id
    where tt.unit_id = p_unit
    group by tt.barber_id
  ),
  appts as (
    select a.barber_id, count(*)::bigint as appointments_done
    from public.appointments a
    where a.unit_id = p_unit
      and a.status = 'concluido'
      and a.starts_at >= p_from
      and a.starts_at < p_to
      and a.barber_id is not null
    group by a.barber_id
  )
  select
    coalesce(i.barber_id, tp.barber_id, ap.barber_id) as barber_id,
    coalesce(i.services_cents, 0),
    coalesce(i.products_cents, 0),
    coalesce(i.tickets_count, 0),
    coalesce(ap.appointments_done, 0),
    coalesce(tp.tips_cents, 0)
  from items i
  full join tips tp on tp.barber_id = i.barber_id
  full join appts ap on ap.barber_id = coalesce(i.barber_id, tp.barber_id);
$$;

revoke all on function public.commission_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.commission_summary(uuid, timestamptz, timestamptz) to authenticated, service_role;
