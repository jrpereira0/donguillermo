-- Dia do atendimento manda na comissão e no faturamento.
-- Uma comanda pode ser recebida em qualquer caixa aberto (inclusive dias depois
-- do atendimento), mas a venda pertence ao dia em que ela foi aberta
-- (horário de São Paulo) — nunca ao dia do recebimento.
-- `register_id`/`closed_at` continuam registrando onde e quando o dinheiro foi
-- recebido, para a conferência física da gaveta e auditoria.

-- Dia oficial do atendimento, derivado da abertura da comanda.
alter table public.tickets
  add column attended_on date
    generated always as ((opened_at at time zone 'America/Sao_Paulo')::date) stored;

create index tickets_unit_attended_idx on public.tickets (unit_id, attended_on desc);

-- Cobrança: qualquer caixa aberto recebe qualquer comanda aberta.
-- Cai a trava da migration 018 (comanda só no caixa do dia dela).
create or replace function public.charge_ticket(
  p_id uuid,
  p_discount integer,
  p_tip integer,
  p_barber uuid,
  p_items jsonb,
  p_payments jsonb,
  p_tips jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_register uuid;
  v_subtotal integer := 0;
  v_total integer;
  v_paid integer := 0;
  v_tip integer;
  v_barber_name text;
  v_uid uuid := (select auth.uid());
  v_name text;
begin
  if p_discount is null or p_discount < 0 or p_tip is null or p_tip < 0 then
    raise exception 'Desconto ou gorjeta inválidos.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'A comanda precisa de 1 a 30 itens.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) > 6 then
    raise exception 'No máximo 6 pagamentos.' using errcode = '22023';
  end if;

  select * into v_ticket from public.tickets where id = p_id for update;
  if not found then
    raise exception 'Comanda não encontrada.' using errcode = 'P0002';
  end if;
  if v_ticket.status <> 'aberta' then
    raise exception 'Esta comanda já foi encerrada.' using errcode = '22023';
  end if;

  select r.id into v_register from public.cash_registers r
    where r.unit_id = v_ticket.unit_id and r.status = 'aberto'
    limit 1;
  if v_register is null then
    raise exception 'Abra o caixa antes de cobrar.' using errcode = 'P0001';
  end if;

  if p_barber is not null then
    select display_name into v_barber_name from public.barbers
      where id = p_barber and unit_id = v_ticket.unit_id;
    if v_barber_name is null then
      raise exception 'Profissional não encontrado.' using errcode = '22023';
    end if;
  end if;

  v_subtotal := public.replace_ticket_items(v_ticket.id, v_ticket.unit_id, p_items);
  if p_discount > v_subtotal then
    raise exception 'O desconto não pode passar do subtotal.' using errcode = '22023';
  end if;

  v_tip := public.replace_ticket_tips(v_ticket.id, v_ticket.unit_id, coalesce(p_tips, '[]'::jsonb));
  if v_tip <> p_tip then
    raise exception 'A gorjeta não confere com os profissionais.' using errcode = '22023';
  end if;
  v_total := v_subtotal - p_discount + v_tip;

  if exists (
    select 1
    from jsonb_array_elements(p_payments) as e(elem)
    where (e.elem ->> 'method') not in ('dinheiro', 'pix', 'debito', 'credito')
      or coalesce((e.elem ->> 'amount_cents')::integer, 0) < 1
      or coalesce((e.elem ->> 'installments')::integer, 1) not between 1 and 12
      or (
        (e.elem ->> 'method') is distinct from 'credito'
        and coalesce((e.elem ->> 'installments')::integer, 1) <> 1
      )
  ) then
    raise exception 'Pagamento inválido.' using errcode = '22023';
  end if;

  select coalesce(sum((e.elem ->> 'amount_cents')::integer), 0) into v_paid
    from jsonb_array_elements(p_payments) as e(elem);
  if v_total = 0 then
    if v_paid <> 0 then
      raise exception 'Comanda zerada não leva pagamento.' using errcode = '22023';
    end if;
  elsif jsonb_array_length(p_payments) < 1 or v_paid <> v_total then
    raise exception 'A soma dos pagamentos precisa fechar o total.' using errcode = '22023';
  end if;

  if v_total > 0 then
    insert into public.ticket_payments (ticket_id, unit_id, register_id, method, amount_cents, installments)
    select
      v_ticket.id,
      v_ticket.unit_id,
      v_register,
      e.elem ->> 'method',
      (e.elem ->> 'amount_cents')::integer,
      case
        when e.elem ->> 'method' = 'credito' then coalesce((e.elem ->> 'installments')::integer, 1)
        else 1
      end
    from jsonb_array_elements(p_payments) as e(elem);
  end if;

  if v_uid is not null then
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_name
      from public.profiles p where p.id = v_uid;
  end if;

  perform public.sync_ticket_agenda(v_ticket.id);

  update public.tickets set
    status = 'fechada',
    discount_cents = p_discount,
    tip_cents = v_tip,
    barber_id = p_barber,
    barber_name = v_barber_name,
    register_id = v_register,
    closed_at = now(),
    closed_by = v_uid,
    closed_by_name = v_name
  where id = v_ticket.id;

  if v_ticket.appointment_id is not null then
    update public.appointments set status = 'concluido'
      where (id = v_ticket.appointment_id or parent_appointment_id = v_ticket.appointment_id)
        and status in ('agendado', 'confirmado', 'em_atendimento');
  end if;

  return v_ticket.id;
end;
$$;

-- A trava de dia da migration 018 sai por completo.
drop trigger if exists tickets_guard_close_day on public.tickets;
drop function if exists public.guard_ticket_close_day();

revoke all on function public.charge_ticket(uuid, integer, integer, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.charge_ticket(uuid, integer, integer, uuid, jsonb, jsonb, jsonb) to authenticated, service_role;

-- Comissões: a produção é das comandas cujo ATENDIMENTO caiu no período
-- (attended_on), tenham sido recebidas nele ou depois. Os limites chegam como
-- inícios de dia em São Paulo, então a comparação é por data.
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
