-- Correção da 030: dentro do trigger BEFORE, `new.attended_on` (coluna
-- gerada) ainda vem nula — o Postgres só calcula a coluna gerada depois dos
-- triggers BEFORE. O dia do atendimento é derivado de `new.opened_at`, que é
-- exatamente de onde attended_on nasce.

create or replace function public.guard_ticket_close_day()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
declare
  v_day date;
  v_ticket_day date;
begin
  if new.status = 'fechada' and old.status is distinct from 'fechada' and new.register_id is not null then
    select r.business_date into v_day from public.cash_registers r where r.id = new.register_id;
    v_ticket_day := (new.opened_at at time zone 'America/Sao_Paulo')::date;
    if v_day is distinct from v_ticket_day then
      raise exception 'Esta comanda é de % e o caixa é de %. Uma comanda só pode ser recebida no caixa do dia dela.',
        to_char(v_ticket_day, 'DD/MM/YYYY'), to_char(v_day, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$guard$;
