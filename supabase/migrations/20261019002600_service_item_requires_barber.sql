-- Serviço sem profissional perde a comissão de quem fez: não pode ficar
-- gravado na comanda. A tela já bloqueia salvar/receber; este gatilho é a
-- última linha no banco para qualquer caminho de gravação (RPC de itens,
-- sincronias da agenda). Item de produto (vendedor) e a VENDA do pacote
-- (linha "pacote", sem comissão por regra do negócio) ficam fora.

create or replace function public.guard_ticket_item_barber()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.kind = 'servico' and new.barber_id is null then
    raise exception 'Serviço sem profissional: escolha quem fez o serviço para a comissão não se perder.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_items_guard_barber on public.ticket_items;
create trigger ticket_items_guard_barber
  before insert or update on public.ticket_items
  for each row execute function public.guard_ticket_item_barber();
