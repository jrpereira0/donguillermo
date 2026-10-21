-- =============================================================================
-- Sangria nunca passa do dinheiro que há na gaveta
-- =============================================================================
-- A gaveta esperada é: fundo de abertura + suprimentos − sangrias + vendas em
-- dinheiro do caixa. Uma sangria maior que isso deixava a gaveta negativa
-- (aceitou R$ 10.000 com a gaveta em R$ 0). A action confere antes e mostra o
-- valor; este gatilho é a última linha — vale para qualquer caminho de escrita
-- e trava a linha do caixa para duas sangrias simultâneas não furarem o teto.
-- =============================================================================

create or replace function public.cash_movements_guard_sangria()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opening integer;
  v_in bigint;
  v_out bigint;
  v_cash bigint;
begin
  if new.kind <> 'sangria' then
    return new;
  end if;

  -- Trava a linha do caixa: sangrias concorrentes são serializadas aqui.
  select opening_cents into v_opening
    from public.cash_registers
   where id = new.register_id
   for update;
  if not found then
    return new;
  end if;

  select coalesce(sum(amount_cents) filter (where kind = 'suprimento'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'sangria'), 0)
    into v_in, v_out
    from public.cash_movements
   where register_id = new.register_id;

  select coalesce(sum(amount_cents), 0) into v_cash
    from public.ticket_payments
   where register_id = new.register_id and method = 'dinheiro';

  if new.amount_cents > v_opening + v_in - v_out + v_cash then
    raise exception 'A sangria não pode passar do dinheiro na gaveta.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists cash_movements_guard_sangria on public.cash_movements;
create trigger cash_movements_guard_sangria
  before insert on public.cash_movements
  for each row execute function public.cash_movements_guard_sangria();
