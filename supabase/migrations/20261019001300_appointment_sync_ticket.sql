-- O agendamento também manda na comanda ABERTA: editar (ou arrastar) um
-- agendamento com comanda aberta atualiza os serviços da comanda a partir dos
-- cards da família (origem + cards criados pela comanda). Produtos lançados,
-- gorjetas e o desconto (limitado ao novo subtotal) ficam.

create or replace function public.sync_appointment_ticket(p_appointment uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent public.appointments%rowtype;
  v_ticket public.tickets%rowtype;
  v_count integer := 0;
  v_sub integer := 0;
  v_barber_name text;
begin
  select * into v_parent from public.appointments where id = p_appointment and kind = 'appointment';
  if not found then
    return;
  end if;
  if v_parent.parent_appointment_id is not null then
    select * into v_parent from public.appointments
      where id = v_parent.parent_appointment_id and kind = 'appointment';
    if not found then
      return;
    end if;
  end if;

  select * into v_ticket from public.tickets
    where appointment_id = v_parent.id and status = 'aberta'
    order by opened_at desc
    limit 1
    for update;
  if not found then
    return;
  end if;

  -- Produtos saem do caminho (posição alta) e voltam depois dos serviços.
  update public.ticket_items set position = position + 100
    where ticket_id = v_ticket.id and kind = 'produto';

  delete from public.ticket_items
    where ticket_id = v_ticket.id and kind = 'servico';

  insert into public.ticket_items (
    ticket_id, unit_id, position, kind, service_id, name, quantity, unit_price_cents, barber_id, barber_name
  )
  select
    v_ticket.id,
    v_parent.unit_id,
    (row_number() over (order by fam.ordem, fam.criado, fam.pos) - 1)::smallint,
    'servico',
    fam.service_id,
    fam.nome,
    fam.qtd,
    fam.unit_price,
    fam.barber_id,
    (select b.display_name from public.barbers b where b.id = fam.barber_id and b.unit_id = v_parent.unit_id)
  from (
    select
      case when a.id = v_parent.id then 0 else 1 end as ordem,
      a.created_at as criado,
      s.position as pos,
      a.barber_id,
      s.service_id,
      case
        when s.name ~ '^[0-9]+× .+$' then regexp_replace(s.name, '^[0-9]+× ', '')
        else s.name
      end as nome,
      case
        when s.name ~ '^[0-9]+× .+$'
         and least(20, greatest(1, substring(s.name from '^([0-9]+)× ')::integer)) > 1
         and s.price_cents % least(20, greatest(1, substring(s.name from '^([0-9]+)× ')::integer)) = 0
          then least(20, greatest(1, substring(s.name from '^([0-9]+)× ')::integer))
        else 1
      end as qtd,
      case
        when s.name ~ '^[0-9]+× .+$'
         and least(20, greatest(1, substring(s.name from '^([0-9]+)× ')::integer)) > 1
         and s.price_cents % least(20, greatest(1, substring(s.name from '^([0-9]+)× ')::integer)) = 0
          then s.price_cents / least(20, greatest(1, substring(s.name from '^([0-9]+)× ')::integer))
        else s.price_cents
      end as unit_price
    from public.appointments a
    join public.appointment_services s on s.appointment_id = a.id
    where (a.id = v_parent.id or a.parent_appointment_id = v_parent.id)
      and a.kind = 'appointment'
      and a.status not in ('cancelado', 'faltou')
  ) fam;

  select count(*) into v_count from public.ticket_items
    where ticket_id = v_ticket.id and kind = 'servico';

  update public.ticket_items set position = v_count + (position - 100)
    where ticket_id = v_ticket.id and kind = 'produto';

  select coalesce(sum(quantity * unit_price_cents), 0) into v_sub
    from public.ticket_items where ticket_id = v_ticket.id;

  select display_name into v_barber_name from public.barbers
    where id = v_parent.barber_id and unit_id = v_parent.unit_id;

  update public.tickets set
    customer_id = v_parent.customer_id,
    customer_name = v_parent.customer_name,
    barber_id = v_parent.barber_id,
    barber_name = v_barber_name,
    discount_cents = least(discount_cents, greatest(0, v_sub))
  where id = v_ticket.id;
end;
$$;

-- save_appointment (última versão: 20261019000100) + sincronização da comanda.
create or replace function public.save_appointment(p_id uuid, p_data jsonb, p_services jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_unit uuid;
  v_pref boolean := coalesce((p_data ->> 'has_barber_preference')::boolean, true);
begin
  if jsonb_typeof(p_services) is distinct from 'array' or jsonb_array_length(p_services) not between 1 and 8 then
    raise exception 'Informe de 1 a 8 serviços.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.appointments (
      unit_id, barber_id, kind, customer_id, customer_name, customer_phone,
      starts_at, ends_at, status, notes, has_barber_preference
    ) values (
      (p_data ->> 'unit_id')::uuid,
      (p_data ->> 'barber_id')::uuid,
      'appointment',
      nullif(p_data ->> 'customer_id', '')::uuid,
      p_data ->> 'customer_name',
      nullif(p_data ->> 'customer_phone', ''),
      (p_data ->> 'starts_at')::timestamptz,
      (p_data ->> 'ends_at')::timestamptz,
      coalesce(nullif(p_data ->> 'status', ''), 'agendado'),
      nullif(p_data ->> 'notes', ''),
      v_pref
    )
    returning id, unit_id into v_id, v_unit;
  else
    update public.appointments set
      barber_id             = (p_data ->> 'barber_id')::uuid,
      customer_id           = nullif(p_data ->> 'customer_id', '')::uuid,
      customer_name         = p_data ->> 'customer_name',
      customer_phone        = nullif(p_data ->> 'customer_phone', ''),
      starts_at             = (p_data ->> 'starts_at')::timestamptz,
      ends_at               = (p_data ->> 'ends_at')::timestamptz,
      notes                 = nullif(p_data ->> 'notes', ''),
      has_barber_preference = v_pref
    where id = v_id and kind = 'appointment'
    returning unit_id into v_unit;
    if not found then
      raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
    end if;
    delete from public.appointment_services where appointment_id = v_id;
  end if;

  insert into public.appointment_services (
    appointment_id, unit_id, position, service_id, name, duration_minutes, price_cents
  )
  select
    v_id,
    v_unit,
    (e.idx - 1)::smallint,
    (e.elem ->> 'service_id')::uuid,
    e.elem ->> 'name',
    (e.elem ->> 'duration_minutes')::integer,
    (e.elem ->> 'price_cents')::integer
  from jsonb_array_elements(p_services) with ordinality as e(elem, idx);

  perform public.sync_appointment_ticket(v_id);

  return v_id;
end;
$$;

revoke all on function public.sync_appointment_ticket(uuid) from public, anon;
revoke all on function public.save_appointment(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.sync_appointment_ticket(uuid) to authenticated, service_role;
grant execute on function public.save_appointment(uuid, jsonb, jsonb) to authenticated, service_role;
