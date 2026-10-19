-- Reabrir o último caixa fechado da unidade (ex.: fechou por engano).
-- Só vale se nenhum caixa estiver aberto e for o fechamento mais recente:
-- comandas e pagamentos continuam ligados a este caixa, então ele volta a ser o caixa do dia.

create or replace function public.reopen_cash_register(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reg public.cash_registers%rowtype;
  v_latest uuid;
begin
  select * into v_reg from public.cash_registers where id = p_id for update;
  if not found or v_reg.status <> 'fechado' then
    raise exception 'Caixa não encontrado ou não está fechado.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.cash_registers
    where unit_id = v_reg.unit_id and status = 'aberto'
  ) then
    raise exception 'Já existe um caixa aberto nesta unidade. Feche-o antes de reabrir outro.' using errcode = 'P0001';
  end if;

  select id into v_latest from public.cash_registers
  where unit_id = v_reg.unit_id and status = 'fechado'
  order by closed_at desc
  limit 1;
  if v_latest is distinct from v_reg.id then
    raise exception 'Só o último caixa fechado pode ser reaberto.' using errcode = 'P0001';
  end if;

  update public.cash_registers set
    status = 'aberto',
    closed_at = null,
    closed_by = null,
    closed_by_name = null,
    counted_cash_cents = null,
    expected_cash_cents = null,
    notes = null
  where id = v_reg.id;
end;
$$;

revoke all on function public.reopen_cash_register(uuid) from public, anon;
grant execute on function public.reopen_cash_register(uuid) to authenticated, service_role;
