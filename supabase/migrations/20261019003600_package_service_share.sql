-- Serviço usado de um pacote entra no faturamento pela cota: preço pago no
-- pacote dividido pela quantidade de serviços. A venda do pacote continua sem
-- comissão. Corrige os itens já gravados com o preço de tabela do serviço.

update public.ticket_items i
set unit_price_cents = sub.share
from (
  select
    cp.id,
    round(cp.price_cents::numeric / nullif(sum(cpi.quantity_total), 0))::integer as share
  from public.customer_packages cp
  join public.customer_package_items cpi on cpi.customer_package_id = cp.id
  group by cp.id, cp.price_cents
) sub
where i.customer_package_id = sub.id
  and i.kind = 'servico'
  and sub.share is not null
  and i.unit_price_cents is distinct from sub.share;

-- O resumo também calcula a cota na hora, para não depender do valor gravado
-- no item (o cliente não define o faturamento).
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
      and t.attended_on >= (p_from at time zone 'America/Sao_Paulo')::date
      and t.attended_on < (p_to at time zone 'America/Sao_Paulo')::date
  ),
  shares as (
    select
      cp.id as customer_package_id,
      round(cp.price_cents::numeric / nullif(sum(cpi.quantity_total), 0))::integer as cents
    from public.customer_packages cp
    join public.customer_package_items cpi on cpi.customer_package_id = cp.id
    group by cp.id, cp.price_cents
  ),
  items as (
    select
      i.barber_id,
      sum(case
        when i.kind = 'servico' then i.quantity * coalesce(sh.cents, i.unit_price_cents)
        else 0
      end)::bigint as services_cents,
      sum(case when i.kind = 'produto' then i.quantity * i.unit_price_cents else 0 end)::bigint as products_cents,
      count(distinct i.ticket_id)::bigint as tickets_count
    from public.ticket_items i
    join closed c on c.id = i.ticket_id
    left join shares sh on sh.customer_package_id = i.customer_package_id and i.kind = 'servico'
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
