-- Reabrir o atendimento (concluído → em atendimento, agendado ou confirmado)
-- também reabre a comanda cobrada: desfaz os pagamentos e volta o pacote
-- vendido nela para pendente. Só vale com o caixa daquela cobrança ainda aberto.

drop function if exists public.reopen_ticket(uuid);

create function public.reopen_ticket(p_id uuid, p_appointment_status text default 'agendado')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_status text;
begin
  if p_appointment_status not in ('agendado', 'confirmado', 'em_atendimento') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;

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

  update public.customer_packages set
    status = 'pendente',
    activated_at = null,
    expires_at = null
  where sold_ticket_id = v_ticket.id and status = 'ativa';

  if v_ticket.appointment_id is not null then
    update public.appointments set status = p_appointment_status
      where (id = v_ticket.appointment_id or parent_appointment_id = v_ticket.appointment_id)
        and status = 'concluido';
  end if;

  return v_ticket.id;
end;
$$;

revoke all on function public.reopen_ticket(uuid, text) from public, anon;
grant execute on function public.reopen_ticket(uuid, text) to authenticated, service_role;

-- A comanda é da origem. Card acompanhante (parent_appointment_id) reabre a mesma.
create function public.reopen_attendance(p_appointment uuid, p_status text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_root uuid;
  v_ticket uuid;
  v_n integer;
begin
  if p_status not in ('agendado', 'confirmado', 'em_atendimento') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;

  select * into v_appt from public.appointments where id = p_appointment;
  if not found or v_appt.kind <> 'appointment' then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_appt.status <> 'concluido' then
    raise exception 'Este atendimento não está concluído.' using errcode = '22023';
  end if;

  v_root := coalesce(v_appt.parent_appointment_id, v_appt.id);

  select t.id into v_ticket
  from public.tickets t
  where t.appointment_id = v_root and t.status = 'fechada'
  order by t.closed_at desc nulls last
  limit 1;

  if v_ticket is not null then
    return public.reopen_ticket(v_ticket, p_status);
  end if;

  update public.appointments set status = p_status
    where id = v_root and status = 'concluido';
  get diagnostics v_n = row_count;

  if v_n = 0 then
    update public.appointments set status = p_status
      where id = p_appointment and status = 'concluido';
    get diagnostics v_n = row_count;
  end if;

  if v_n = 0 then
    raise exception 'O agendamento mudou enquanto você olhava. Atualize a tela e tente de novo.'
      using errcode = 'P0001';
  end if;

  return null;
end;
$$;

revoke all on function public.reopen_attendance(uuid, text) from public, anon;
grant execute on function public.reopen_attendance(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
