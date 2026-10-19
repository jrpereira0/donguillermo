-- Recepção pode encaixar dois agendamentos no mesmo horário (a grade divide a coluna).
-- Bloqueios continuam sem sobreposição com qualquer ocupação (agendamento ou outro bloqueio).

alter table public.appointments drop constraint if exists appointments_no_overlap;

create or replace function public.appointments_guard_overlap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Cancelado / faltou liberam o horário.
  if new.status in ('cancelado', 'faltou') then
    return new;
  end if;

  -- Bloqueio não colide com nada ativo; agendamento não colide com bloqueio.
  -- Dois agendamentos ativos podem coincidir (encaixe da recepção).
  if exists (
    select 1
    from public.appointments a
    where a.barber_id = new.barber_id
      and a.id is distinct from new.id
      and a.status not in ('cancelado', 'faltou')
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
      and (new.kind = 'block' or a.kind = 'block')
  ) then
    raise exception 'horario ocupado'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_guard_overlap on public.appointments;
create trigger appointments_guard_overlap
  before insert or update of barber_id, starts_at, ends_at, status, kind
  on public.appointments
  for each row execute function public.appointments_guard_overlap();
