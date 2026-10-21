-- Excluir/cancelar o agendamento também retira o pacote vendido na comanda dele:
-- além de cancelar a comanda ABERTA (regra de 20261019001400), o pacote de uma
-- comanda já COBRADA daquele agendamento é cancelado — o saldo some do cliente.
-- (Pacote de comanda aberta é "pendente" e já cancela pelo gatilho da comanda.)

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

    update public.customer_packages cp set status = 'cancelada'
    where cp.status = 'ativa'
      and cp.sold_ticket_id in (
        select t.id from public.tickets t where t.appointment_id = new.id
      );
  end if;
  return new;
end;
$$;
