-- Um caixa por dia em cada unidade: se o dia já tem caixa (aberto ou fechado),
-- o caminho é reabrir aquele caixa — nunca abrir um segundo para o mesmo dia.
create unique index cash_registers_unit_day_idx
  on public.cash_registers (unit_id, business_date);
