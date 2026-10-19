-- Reabrir comanda já cobrada: desfaz os pagamentos e volta o agendamento.
-- Só vale enquanto o caixa em que ela foi recebida continua aberto; depois do
-- fechamento do caixa o histórico não muda mais.

create policy ticket_payments_delete on public.ticket_payments
  for delete to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

grant delete on public.ticket_payments to authenticated;

create or replace function public.reopen_ticket(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_status text;
begin
  select * into v_ticket from public.tickets where id = p_id for update;
  if not found then
    raise exception 'Comanda não encontrada.' using errcode = 'P0002';
  end if;
  if v_ticket.status <> 'fechada' then
    raise exception 'Esta comanda não está cobrada.' using errcode = '22023';
  end if;

  select status into v_status from public.cash_registers where id = v_ticket.register_id;
  if v_status is distinct from 'aberto' then
    raise exception 'O caixa desta cobrança já foi fechado, então ela não pode ser reaberta.' using errcode = 'P0001';
  end if;

  delete from public.ticket_payments where ticket_id = v_ticket.id and unit_id = v_ticket.unit_id;

  update public.tickets set
    status = 'aberta',
    register_id = null,
    closed_at = null,
    closed_by = null,
    closed_by_name = null
  where id = v_ticket.id;

  if v_ticket.appointment_id is not null then
    update public.appointments set status = 'agendado'
      where (id = v_ticket.appointment_id or parent_appointment_id = v_ticket.appointment_id)
        and status = 'concluido';
  end if;

  return v_ticket.id;
end;
$$;

revoke all on function public.reopen_ticket(uuid) from public, anon;
grant execute on function public.reopen_ticket(uuid) to authenticated, service_role;
