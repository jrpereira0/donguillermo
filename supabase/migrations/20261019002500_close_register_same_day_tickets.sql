-- Fechar o caixa de ontem não pode ficar refém das comandas de hoje.
-- Antes, `close_cash_register` contava TODAS as comandas abertas da unidade:
-- com o caixa de ontem aberto, a comanda de hoje não podia ser recebida (a
-- cobrança exige o caixa do dia dela) e o caixa de ontem não podia fechar
-- (havia uma comanda aberta) — só cancelando a venda para sair do impasse.
-- Agora o bloqueio considera só as comandas abertas DO DIA DESTE CAIXA
-- (dia de abertura em São Paulo, o mesmo critério do charge_ticket): as de
-- outros dias ficam abertas esperando o caixa do dia delas.

create or replace function public.close_cash_register(p_id uuid, p_counted integer, p_notes text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reg public.cash_registers%rowtype;
  v_open integer;
  v_in integer;
  v_out integer;
  v_cash integer;
  v_expected integer;
  v_uid uuid := (select auth.uid());
  v_name text;
begin
  if p_counted is null or p_counted < 0 then
    raise exception 'Informe o dinheiro contado.' using errcode = '22023';
  end if;

  select * into v_reg from public.cash_registers where id = p_id for update;
  if not found or v_reg.status <> 'aberto' then
    raise exception 'Caixa não encontrado ou já fechado.' using errcode = 'P0002';
  end if;

  select count(*) into v_open from public.tickets
    where unit_id = v_reg.unit_id and status = 'aberta'
      and (opened_at at time zone 'America/Sao_Paulo')::date = v_reg.business_date;
  if v_open > 0 then
    raise exception 'Ainda há comandas abertas do dia deste caixa. Receba ou cancele antes de fechar.' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_cents) filter (where kind = 'suprimento'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'sangria'), 0)
    into v_in, v_out
    from public.cash_movements where register_id = v_reg.id;

  select coalesce(sum(amount_cents), 0) into v_cash
    from public.ticket_payments
    where register_id = v_reg.id and method = 'dinheiro';

  v_expected := v_reg.opening_cents + v_in - v_out + v_cash;

  if v_uid is not null then
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_name
      from public.profiles p where p.id = v_uid;
  end if;

  update public.cash_registers set
    status = 'fechado',
    closed_at = now(),
    counted_cash_cents = p_counted,
    expected_cash_cents = v_expected,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    closed_by = v_uid,
    closed_by_name = v_name
  where id = v_reg.id;
end;
$$;

revoke all on function public.close_cash_register(uuid, integer, text) from public, anon;
grant execute on function public.close_cash_register(uuid, integer, text) to authenticated, service_role;
