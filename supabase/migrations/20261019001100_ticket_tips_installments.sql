-- Gorjeta por profissional e parcelas no crédito.
-- O total da comanda continua em tickets.tip_cents (soma das gorjetas).

alter table public.ticket_payments
  add column installments smallint not null default 1
  check (installments between 1 and 12);

alter table public.ticket_payments
  add constraint ticket_payments_installments_method
  check (method = 'credito' or installments = 1);

create table public.ticket_tips (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null,
  unit_id      uuid not null,
  position     smallint not null check (position >= 0),
  barber_id    uuid,
  barber_name  text,
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  constraint ticket_tips_ticket_fk
    foreign key (ticket_id, unit_id) references public.tickets (id, unit_id) on delete cascade,
  constraint ticket_tips_barber_fk
    foreign key (barber_id, unit_id) references public.barbers (id, unit_id) on delete set null,
  constraint ticket_tips_position_unique unique (ticket_id, position)
);

create index ticket_tips_ticket_idx on public.ticket_tips (ticket_id);

alter table public.ticket_tips enable row level security;

create policy ticket_tips_select on public.ticket_tips
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_tips.ticket_id));

create policy ticket_tips_write on public.ticket_tips
  for all to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]))
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

revoke all on public.ticket_tips from anon, authenticated;
grant select, insert, update, delete on public.ticket_tips to authenticated;
grant all on public.ticket_tips to service_role;

create or replace function public.replace_ticket_tips(p_ticket uuid, p_unit uuid, p_tips jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sum integer := 0;
  v_i integer := 0;
  v_elem jsonb;
  v_barber uuid;
  v_amount integer;
  v_name text;
begin
  if p_tips is null or jsonb_typeof(p_tips) is distinct from 'array' or jsonb_array_length(p_tips) > 6 then
    raise exception 'No máximo 6 gorjetas.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.tickets
    where id = p_ticket and unit_id = p_unit and status = 'aberta'
  ) then
    raise exception 'Comanda não encontrada.' using errcode = 'P0002';
  end if;

  delete from public.ticket_tips where ticket_id = p_ticket and unit_id = p_unit;

  for v_elem in select e.value from jsonb_array_elements(p_tips) as e(value)
  loop
    v_barber := nullif(v_elem ->> 'barber_id', '')::uuid;
    v_amount := (v_elem ->> 'amount_cents')::integer;
    if v_barber is null or v_amount is null or v_amount < 1 or v_amount > 10000000 then
      raise exception 'Informe o valor e o profissional da gorjeta.' using errcode = '22023';
    end if;
    select b.display_name into v_name
      from public.barbers b
      where b.id = v_barber and b.unit_id = p_unit;
    if v_name is null then
      raise exception 'Profissional da gorjeta não encontrado.' using errcode = '22023';
    end if;
    insert into public.ticket_tips (ticket_id, unit_id, position, barber_id, barber_name, amount_cents)
    values (p_ticket, p_unit, v_i, v_barber, v_name, v_amount);
    v_sum := v_sum + v_amount;
    v_i := v_i + 1;
  end loop;

  return v_sum;
end;
$$;

drop function public.save_open_ticket(uuid, integer, integer, text, uuid, jsonb);
drop function public.charge_ticket(uuid, integer, integer, uuid, jsonb, jsonb);

create function public.save_open_ticket(
  p_id uuid,
  p_discount integer,
  p_tip integer,
  p_notes text,
  p_barber uuid,
  p_items jsonb,
  p_tips jsonb
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
  v_tip integer;
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

  v_tip := public.replace_ticket_tips(v_ticket.id, v_ticket.unit_id, coalesce(p_tips, '[]'::jsonb));
  if v_tip <> p_tip then
    raise exception 'A gorjeta não confere com os profissionais.' using errcode = '22023';
  end if;

  update public.tickets set
    discount_cents = p_discount,
    tip_cents = v_tip,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    barber_id = p_barber,
    barber_name = v_barber_name
  where id = v_ticket.id;

  perform public.sync_ticket_agenda(v_ticket.id);
end;
$$;

create function public.charge_ticket(
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

revoke all on function public.replace_ticket_tips(uuid, uuid, jsonb) from public, anon;
revoke all on function public.save_open_ticket(uuid, integer, integer, text, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.charge_ticket(uuid, integer, integer, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.replace_ticket_tips(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.save_open_ticket(uuid, integer, integer, text, uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.charge_ticket(uuid, integer, integer, uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
