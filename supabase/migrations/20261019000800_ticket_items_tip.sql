-- Itens de produto, profissional por item e gorjeta na comanda.

alter table public.ticket_items
  add column if not exists kind text not null default 'servico'
    check (kind in ('servico', 'produto'));

alter table public.ticket_items
  add column if not exists barber_id uuid;

alter table public.ticket_items
  add column if not exists barber_name text;

alter table public.ticket_items
  drop constraint if exists ticket_items_barber_fk;

alter table public.ticket_items
  add constraint ticket_items_barber_fk
  foreign key (barber_id, unit_id) references public.barbers (id, unit_id) on delete set null;

alter table public.tickets
  add column if not exists tip_cents integer not null default 0
    check (tip_cents between 0 and 10000000);

-- Troca os itens da comanda aberta e devolve o subtotal.
create or replace function public.replace_ticket_items(p_ticket uuid, p_unit uuid, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sub integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 30 then
    raise exception 'No máximo 30 itens.' using errcode = '22023';
  end if;

  delete from public.ticket_items where ticket_id = p_ticket;

  if jsonb_array_length(p_items) > 0 then
    insert into public.ticket_items (
      ticket_id, unit_id, position, kind, service_id, name, quantity, unit_price_cents, barber_id, barber_name
    )
    select
      p_ticket,
      p_unit,
      (e.idx - 1)::smallint,
      case when e.elem ->> 'kind' = 'produto' then 'produto' else 'servico' end,
      case when e.elem ->> 'kind' = 'produto' then null else nullif(e.elem ->> 'service_id', '')::uuid end,
      e.elem ->> 'name',
      (e.elem ->> 'quantity')::smallint,
      (e.elem ->> 'unit_price_cents')::integer,
      nullif(e.elem ->> 'barber_id', '')::uuid,
      (
        select b.display_name from public.barbers b
        where b.id = nullif(e.elem ->> 'barber_id', '')::uuid and b.unit_id = p_unit
      )
    from jsonb_array_elements(p_items) with ordinality as e(elem, idx);
  end if;

  if exists (
    select 1 from public.ticket_items i
    where i.ticket_id = p_ticket and i.barber_id is not null and i.barber_name is null
  ) then
    raise exception 'Profissional não encontrado.' using errcode = '22023';
  end if;

  select coalesce(sum(quantity * unit_price_cents), 0) into v_sub
    from public.ticket_items where ticket_id = p_ticket;
  return v_sub;
end;
$$;

drop function if exists public.save_open_ticket(uuid, integer, text, uuid, jsonb);

create or replace function public.save_open_ticket(
  p_id uuid,
  p_discount integer,
  p_tip integer,
  p_notes text,
  p_barber uuid,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_barber_name text;
  v_sub integer;
begin
  if p_discount is null or p_discount < 0 or p_tip is null or p_tip < 0 then
    raise exception 'Desconto ou gorjeta inválidos.' using errcode = '22023';
  end if;

  select * into v_ticket from public.tickets where id = p_id for update;
  if not found then
    raise exception 'Comanda não encontrada.' using errcode = 'P0002';
  end if;
  if v_ticket.status <> 'aberta' then
    raise exception 'Esta comanda já foi encerrada.' using errcode = '22023';
  end if;

  if p_barber is not null then
    select display_name into v_barber_name from public.barbers
      where id = p_barber and unit_id = v_ticket.unit_id;
    if v_barber_name is null then
      raise exception 'Profissional não encontrado.' using errcode = '22023';
    end if;
  end if;

  v_sub := public.replace_ticket_items(v_ticket.id, v_ticket.unit_id, p_items);
  if p_discount > v_sub then
    raise exception 'O desconto não pode passar do subtotal.' using errcode = '22023';
  end if;

  update public.tickets set
    discount_cents = p_discount,
    tip_cents = p_tip,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    barber_id = p_barber,
    barber_name = v_barber_name
  where id = v_ticket.id;
end;
$$;

drop function if exists public.charge_ticket(uuid, integer, jsonb, jsonb);

create or replace function public.charge_ticket(
  p_id uuid,
  p_discount integer,
  p_tip integer,
  p_barber uuid,
  p_items jsonb,
  p_payments jsonb
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
  v_total := v_subtotal - p_discount + p_tip;

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
    insert into public.ticket_payments (ticket_id, unit_id, register_id, method, amount_cents)
    select
      v_ticket.id,
      v_ticket.unit_id,
      v_register,
      e.elem ->> 'method',
      (e.elem ->> 'amount_cents')::integer
    from jsonb_array_elements(p_payments) as e(elem);
  end if;

  if v_uid is not null then
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_name
      from public.profiles p where p.id = v_uid;
  end if;

  update public.tickets set
    status = 'fechada',
    discount_cents = p_discount,
    tip_cents = p_tip,
    barber_id = p_barber,
    barber_name = v_barber_name,
    register_id = v_register,
    closed_at = now(),
    closed_by = v_uid,
    closed_by_name = v_name
  where id = v_ticket.id;

  if v_ticket.appointment_id is not null then
    update public.appointments set status = 'concluido'
      where id = v_ticket.appointment_id
        and status in ('agendado', 'confirmado', 'em_atendimento');
  end if;

  return v_ticket.id;
end;
$$;

revoke all on function public.replace_ticket_items(uuid, uuid, jsonb) from public, anon;
revoke all on function public.save_open_ticket(uuid, integer, integer, text, uuid, jsonb) from public, anon;
revoke all on function public.charge_ticket(uuid, integer, integer, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_ticket_items(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.save_open_ticket(uuid, integer, integer, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.charge_ticket(uuid, integer, integer, uuid, jsonb, jsonb) to authenticated, service_role;
