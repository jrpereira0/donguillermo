-- Se a migration anterior chegou a barrar agendamento × agendamento, restaura o encaixe
-- da recepção. O cliente no navegador continua sem encaixe via checagem na aplicação.

create or replace function public.appointments_guard_overlap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('cancelado', 'faltou') then
    return new;
  end if;

  if new.kind = 'block' and exists (
    select 1
    from public.appointments a
    where a.barber_id = new.barber_id
      and a.id is distinct from new.id
      and a.kind = 'block'
      and a.status not in ('cancelado', 'faltou')
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'horario ocupado'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;
