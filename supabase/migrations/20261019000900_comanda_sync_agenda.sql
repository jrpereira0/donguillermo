-- A comanda manda na grade: ao salvar, o card (e o hover) do agendamento
-- passam a mostrar os serviços daquele profissional. Serviço lançado para
-- outro profissional vira um card no mesmo horário de início.

alter table public.appointments
  add column if not exists parent_appointment_id uuid;

alter table public.appointments
  drop constraint if exists appointments_parent_fk;

alter table public.appointments
  add constraint appointments_parent_fk
  foreign key (parent_appointment_id) references public.appointments (id) on delete cascade;

alter table public.appointments
  drop constraint if exists appointments_parent_not_self;

alter table public.appointments
  add constraint appointments_parent_not_self
  check (parent_appointment_id is null or parent_appointment_id <> id);

create index if not exists appointments_parent_idx
  on public.appointments (parent_appointment_id)
  where parent_appointment_id is not null;

create unique index if not exists appointments_companion_barber_idx
  on public.appointments (parent_appointment_id, barber_id)
  where parent_appointment_id is not null and status not in ('cancelado', 'faltou');

grant insert (parent_appointment_id) on public.appointments to authenticated;
grant update (parent_appointment_id) on public.appointments to authenticated;

-- Quando o horário ou a situação do agendamento de origem mudam, os cards
-- criados pela comanda acompanham.
create or replace function public.appointments_follow_parent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' or old.parent_appointment_id is not null then
    return new;
  end if;
  if new.starts_at is not distinct from old.starts_at
     and new.status is not distinct from old.status
     and new.customer_id is not distinct from old.customer_id
     and new.customer_name is not distinct from old.customer_name
     and new.customer_phone is not distinct from old.customer_phone then
    return new;
  end if;

  update public.appointments c set
    starts_at = new.starts_at,
    ends_at = new.starts_at + (c.ends_at - c.starts_at),
    status = new.status,
    customer_id = new.customer_id,
    customer_name = new.customer_name,
    customer_phone = new.customer_phone
  where c.parent_appointment_id = new.id
    and c.status not in ('cancelado', 'faltou');

  return new;
end;
$$;

drop trigger if exists appointments_follow_parent on public.appointments;
create trigger appointments_follow_parent
  after update on public.appointments
  for each row execute function public.appointments_follow_parent();

-- Reescreve os cards a partir dos serviços da comanda aberta.
create or replace function public.sync_ticket_agenda(p_ticket uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_parent public.appointments%rowtype;
  v_barber uuid;
  v_card uuid;
  v_minutes integer;
  v_line_minutes integer;
  v_pos smallint;
  v_item record;
begin
  select * into v_ticket from public.tickets where id = p_ticket;
  if not found or v_ticket.appointment_id is null then
    return;
  end if;

  select * into v_parent from public.appointments
    where id = v_ticket.appointment_id and kind = 'appointment'
    for update;
  if not found then
    return;
  end if;

  -- Some com o card de quem não tem mais serviço nesta comanda.
  update public.appointments c set status = 'cancelado'
  where c.parent_appointment_id = v_parent.id
    and c.status not in ('cancelado', 'faltou')
    and not exists (
      select 1 from public.ticket_items i
      where i.ticket_id = v_ticket.id
        and i.kind = 'servico'
        and i.service_id is not null
        and coalesce(i.barber_id, v_parent.barber_id) = c.barber_id
    );

  for v_barber in
    select distinct coalesce(i.barber_id, v_parent.barber_id) as id
    from public.ticket_items i
    where i.ticket_id = v_ticket.id
      and i.kind = 'servico'
      and i.service_id is not null
      and coalesce(i.barber_id, v_parent.barber_id) is not null
  loop
    v_minutes := 0;
    v_pos := 0;

    if v_barber = v_parent.barber_id then
      v_card := v_parent.id;
      delete from public.appointment_services where appointment_id = v_card;
    else
      select c.id into v_card
      from public.appointments c
      where c.parent_appointment_id = v_parent.id
        and c.barber_id = v_barber
        and c.status not in ('cancelado', 'faltou')
      limit 1;

      if v_card is null then
        select c.id into v_card
        from public.appointments c
        where c.parent_appointment_id = v_parent.id
          and c.barber_id = v_barber
        order by c.created_at desc
        limit 1;
      end if;

      if v_card is null then
        insert into public.appointments (
          unit_id, barber_id, kind, customer_id, customer_name, customer_phone,
          starts_at, ends_at, status, notes, has_barber_preference, parent_appointment_id
        ) values (
          v_parent.unit_id,
          v_barber,
          'appointment',
          v_parent.customer_id,
          v_parent.customer_name,
          v_parent.customer_phone,
          v_parent.starts_at,
          v_parent.starts_at + interval '15 minutes',
          v_parent.status,
          v_parent.notes,
          true,
          v_parent.id
        )
        returning id into v_card;
      else
        update public.appointments set
          status = v_parent.status,
          customer_id = v_parent.customer_id,
          customer_name = v_parent.customer_name,
          customer_phone = v_parent.customer_phone,
          notes = v_parent.notes,
          has_barber_preference = true
        where id = v_card;
        delete from public.appointment_services where appointment_id = v_card;
      end if;
    end if;

    for v_item in
      select i.service_id, i.name, i.quantity, i.unit_price_cents
      from public.ticket_items i
      where i.ticket_id = v_ticket.id
        and i.kind = 'servico'
        and i.service_id is not null
        and coalesce(i.barber_id, v_parent.barber_id) = v_barber
      order by i.position
    loop
      select coalesce(bs.duration_minutes, s.duration_minutes, 30)
        into v_line_minutes
      from public.services s
      left join public.barber_services bs
        on bs.service_id = s.id and bs.barber_id = v_barber and bs.unit_id = v_parent.unit_id
      where s.id = v_item.service_id and s.unit_id = v_parent.unit_id;

      v_line_minutes := least(480, greatest(1, coalesce(v_line_minutes, 30) * greatest(v_item.quantity, 1)));
      v_minutes := v_minutes + v_line_minutes;

      insert into public.appointment_services (
        appointment_id, unit_id, position, service_id, name, duration_minutes, price_cents
      ) values (
        v_card,
        v_parent.unit_id,
        v_pos,
        v_item.service_id,
        left(case when v_item.quantity > 1 then v_item.quantity::text || '× ' || v_item.name else v_item.name end, 80),
        v_line_minutes,
        least(10000000, greatest(0, v_item.unit_price_cents * greatest(v_item.quantity, 1)))
      );
      v_pos := v_pos + 1;
    end loop;

    if v_minutes < 1 then
      v_minutes := 15;
    else
      v_minutes := least(720, v_minutes);
    end if;
    update public.appointments
      set starts_at = v_parent.starts_at,
          ends_at = v_parent.starts_at + make_interval(mins => v_minutes)
      where id = v_card;
  end loop;

  -- Agendamento de origem sem serviço nenhum ainda ocupa um bloco curto.
  if not exists (
    select 1 from public.ticket_items i
    where i.ticket_id = v_ticket.id
      and i.kind = 'servico'
      and i.service_id is not null
      and coalesce(i.barber_id, v_parent.barber_id) = v_parent.barber_id
  ) then
    delete from public.appointment_services where appointment_id = v_parent.id;
    update public.appointments
      set ends_at = starts_at + interval '15 minutes'
      where id = v_parent.id;
  end if;
end;
$$;

create or replace function public.open_ticket_from_appointment(p_appointment uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_id uuid;
  v_barber_name text;
begin
  select * into v_appt from public.appointments
    where id = p_appointment and kind = 'appointment';
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  -- Card criado pela comanda abre a mesma comanda do horário de origem.
  if v_appt.parent_appointment_id is not null then
    select * into v_appt from public.appointments
      where id = v_appt.parent_appointment_id and kind = 'appointment';
    if not found then
      raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
    end if;
  end if;
  if v_appt.status in ('cancelado', 'faltou') then
    raise exception 'Este agendamento não pode ser cobrado.' using errcode = '22023';
  end if;

  select t.id into v_id from public.tickets t
    where t.appointment_id = v_appt.id and t.status <> 'cancelada'
    limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select b.display_name into v_barber_name from public.barbers b where b.id = v_appt.barber_id;

  insert into public.tickets (
    unit_id, appointment_id, customer_id, customer_name, barber_id, barber_name, notes
  ) values (
    v_appt.unit_id,
    v_appt.id,
    v_appt.customer_id,
    v_appt.customer_name,
    v_appt.barber_id,
    v_barber_name,
    v_appt.notes
  )
  returning id into v_id;

  insert into public.ticket_items (
    ticket_id, unit_id, position, kind, service_id, name, quantity, unit_price_cents, barber_id, barber_name
  )
  select
    v_id, v_appt.unit_id, s.position, 'servico', s.service_id, s.name, 1, s.price_cents,
    v_appt.barber_id, v_barber_name
  from public.appointment_services s
  where s.appointment_id = v_appt.id
  order by s.position;

  return v_id;
end;
$$;

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

  perform public.sync_ticket_agenda(v_ticket.id);
end;
$$;

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

  perform public.sync_ticket_agenda(v_ticket.id);

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
      where (id = v_ticket.appointment_id or parent_appointment_id = v_ticket.appointment_id)
        and status in ('agendado', 'confirmado', 'em_atendimento');
  end if;

  return v_ticket.id;
end;
$$;

revoke all on function public.sync_ticket_agenda(uuid) from public, anon;
grant execute on function public.sync_ticket_agenda(uuid) to authenticated, service_role;
