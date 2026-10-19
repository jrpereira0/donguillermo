-- Agendamento cancelado/excluído (ou falta) não fica com comanda aberta:
-- a comanda ABERTA daquele agendamento é cancelada junto. Comanda já cobrada
-- (fechada) é histórico de caixa e não muda. Cards criados pela comanda
-- (parent_appointment_id) não têm comanda própria — a comanda é a da origem —
-- então cancelar um card acompanhante não cancela a comanda.

create or replace function public.appointments_cancel_open_ticket()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('cancelado', 'faltou')
     and old.status is distinct from new.status then
    update public.tickets set
      status = 'cancelada',
      closed_at = now(),
      register_id = null
    where appointment_id = new.id
      and status = 'aberta';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_cancel_open_ticket on public.appointments;
create trigger appointments_cancel_open_ticket
  after update of status on public.appointments
  for each row execute function public.appointments_cancel_open_ticket();
