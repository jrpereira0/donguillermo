-- =============================================================================
-- Preferência de profissional no agendamento
-- =============================================================================
-- has_barber_preference = true  → cliente escolheu o profissional (com preferência)
-- has_barber_preference = false → cliente sem preferência (qualquer um; métrica futura)
-- Bloqueios mantêm o default true (campo irrelevante para kind = block).
-- =============================================================================

alter table public.appointments
  add column if not exists has_barber_preference boolean not null default true;

comment on column public.appointments.has_barber_preference is
  'true = cliente pediu aquele profissional; false = sem preferência (atribuído a quem estava livre).';

revoke all on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;
grant insert (
  unit_id, barber_id, kind, customer_id, customer_name, customer_phone,
  starts_at, ends_at, status, notes, has_barber_preference
) on public.appointments to authenticated;
grant update (
  barber_id, customer_id, customer_name, customer_phone,
  starts_at, ends_at, status, notes, has_barber_preference
) on public.appointments to authenticated;
grant delete on public.appointments to authenticated;
grant select, insert, delete on public.appointment_services to authenticated;
grant all on public.appointments, public.appointment_services to service_role;

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

  return v_id;
end;
$$;

revoke all on function public.save_appointment(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_appointment(uuid, jsonb, jsonb) to authenticated, service_role;
