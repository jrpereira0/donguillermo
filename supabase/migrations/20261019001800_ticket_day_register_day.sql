-- Segurança do caixa: comanda só pode ser fechada no caixa do dia dela.
-- A cobrança confere a data de referência do caixa aberto com o dia da comanda
-- (dia em que ela foi aberta, horário de São Paulo). Vale nos dois sentidos:
-- nem comanda antiga em caixa novo, nem comanda nova em caixa de outro dia.

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
  v_register_day date;
  v_ticket_day date;
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

  select r.id, r.business_date into v_register, v_register_day from public.cash_registers r
    where r.unit_id = v_ticket.unit_id and r.status = 'aberto'
    limit 1;
  if v_register is null then
    raise exception 'Abra o caixa antes de cobrar.' using errcode = 'P0001';
  end if;

  -- Segurança do caixa: a comanda só fecha no caixa do dia dela.
  v_ticket_day := (v_ticket.opened_at at time zone 'America/Sao_Paulo')::date;
  if v_register_day is distinct from v_ticket_day then
    raise exception 'Esta comanda é do dia % e o caixa aberto é do dia %. Uma comanda só pode ser fechada no caixa do dia dela: feche o caixa atual e abra ou reabra o caixa do dia %.',
      to_char(v_ticket_day, 'DD/MM/YYYY'), to_char(v_register_day, 'DD/MM/YYYY'), to_char(v_ticket_day, 'DD/MM/YYYY')
      using errcode = 'P0001';
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

-- Última linha: qualquer caminho que feche uma comanda ligada a um caixa
-- passa pela mesma conferência de dia.
create or replace function public.guard_ticket_close_day()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
declare
  v_day date;
  v_ticket_day date;
begin
  if new.status = 'fechada' and old.status is distinct from 'fechada' and new.register_id is not null then
    select r.business_date into v_day from public.cash_registers r where r.id = new.register_id;
    v_ticket_day := (new.opened_at at time zone 'America/Sao_Paulo')::date;
    if v_day is distinct from v_ticket_day then
      raise exception 'Esta comanda é do dia % e o caixa é do dia %. Uma comanda só pode ser fechada no caixa do dia dela.',
        to_char(v_ticket_day, 'DD/MM/YYYY'), to_char(v_day, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$guard$;

drop trigger if exists tickets_guard_close_day on public.tickets;
create trigger tickets_guard_close_day
  before update of status on public.tickets
  for each row execute function public.guard_ticket_close_day();

revoke all on function public.charge_ticket(uuid, integer, integer, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.charge_ticket(uuid, integer, integer, uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
