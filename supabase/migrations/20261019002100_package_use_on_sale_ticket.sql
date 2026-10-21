-- Usar o pacote na MESMA comanda em que ele está sendo vendido: a recepção vende,
-- lança o serviço que o cliente já fez hoje "pelo pacote" (sem cobrar de novo) e
-- cobra só o pacote. O pacote continua pendente até cobrar — mas, nesta comanda,
-- o uso é liberado porque a venda está nela. Ao fechar, o trigger ativa o pacote
-- já com esse uso baixado do saldo.

create or replace function public.replace_ticket_items(p_ticket uuid, p_unit uuid, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer uuid;
  v_sub integer;
  v_bad text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 30 then
    raise exception 'No máximo 30 itens.' using errcode = '22023';
  end if;

  select customer_id into v_customer from public.tickets where id = p_ticket;

  delete from public.ticket_items where ticket_id = p_ticket;

  if jsonb_array_length(p_items) > 0 then
    insert into public.ticket_items (
      ticket_id, unit_id, position, kind, service_id, name, quantity, unit_price_cents,
      barber_id, barber_name, customer_package_id, package_id
    )
    select
      p_ticket,
      p_unit,
      (e.idx - 1)::smallint,
      case
        when e.elem ->> 'kind' = 'produto' then 'produto'
        when e.elem ->> 'kind' = 'pacote' then 'pacote'
        else 'servico'
      end,
      case when e.elem ->> 'kind' in ('produto', 'pacote') then null else nullif(e.elem ->> 'service_id', '')::uuid end,
      e.elem ->> 'name',
      (e.elem ->> 'quantity')::smallint,
      (e.elem ->> 'unit_price_cents')::integer,
      nullif(e.elem ->> 'barber_id', '')::uuid,
      (
        select b.display_name from public.barbers b
        where b.id = nullif(e.elem ->> 'barber_id', '')::uuid and b.unit_id = p_unit
      ),
      nullif(e.elem ->> 'customer_package_id', '')::uuid,
      nullif(e.elem ->> 'package_id', '')::uuid
    from jsonb_array_elements(p_items) with ordinality as e(elem, idx);
  end if;

  if exists (
    select 1 from public.ticket_items i
    where i.ticket_id = p_ticket and i.barber_id is not null and i.barber_name is null
  ) then
    raise exception 'Profissional não encontrado.' using errcode = '22023';
  end if;

  -- Item de venda: precisa ser o pacote pendente vendido nesta comanda, pelo preço dele.
  select cp.package_name into v_bad
  from public.ticket_items i
  join public.customer_packages cp on cp.id = i.customer_package_id
  where i.ticket_id = p_ticket and i.kind = 'pacote'
    and (cp.unit_id <> p_unit or cp.sold_ticket_id is distinct from p_ticket
         or cp.status <> 'pendente' or i.quantity <> 1 or i.unit_price_cents <> cp.price_cents)
  limit 1;
  if v_bad is not null then
    raise exception 'Item de pacote inválido nesta comanda.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.ticket_items i
    where i.ticket_id = p_ticket and i.kind = 'pacote' and i.customer_package_id is null
  ) then
    raise exception 'Item de pacote inválido nesta comanda.' using errcode = '22023';
  end if;
  -- E a venda não pode perder o item do pacote ao salvar/cobrar.
  if exists (
    select 1 from public.customer_packages cp
    where cp.sold_ticket_id = p_ticket and cp.status = 'pendente'
      and not exists (
        select 1 from public.ticket_items i
        where i.ticket_id = p_ticket and i.kind = 'pacote' and i.customer_package_id = cp.id
      )
  ) then
    raise exception 'A comanda de venda do pacote precisa manter o item do pacote.' using errcode = '22023';
  end if;

  -- Uso de pacote: pacote do cliente desta comanda, dentro da validade, serviço
  -- contratado e saldo suficiente (uso = itens em comandas não canceladas).
  -- Vale pacote ATIVO ou o pacote PENDENTE que está sendo vendido NESTA comanda
  -- (o uso de hoje entra junto com a venda; o pacote ativa ao cobrar).
  select i.name into v_bad
  from public.ticket_items i
  left join public.customer_packages cp on cp.id = i.customer_package_id
  where i.ticket_id = p_ticket and i.kind = 'servico' and i.customer_package_id is not null
    and (
      cp.id is null
      or cp.unit_id <> p_unit
      or cp.customer_id is distinct from v_customer
      or not (
        cp.status = 'ativa'
        or (cp.status = 'pendente' and cp.sold_ticket_id = p_ticket)
      )
      or (cp.expires_at is not null and cp.expires_at < now())
      or not exists (
        select 1 from public.customer_package_items cpi
        where cpi.customer_package_id = cp.id and cpi.service_id = i.service_id
      )
    )
  limit 1;
  if v_bad is not null then
    raise exception 'O serviço % não está disponível no pacote deste cliente (pacote inativo, vencido ou serviço fora do pacote).', v_bad
      using errcode = '22023';
  end if;

  select cpi.service_name into v_bad
  from public.customer_package_items cpi
  join public.ticket_items i
    on i.customer_package_id = cpi.customer_package_id and i.service_id = cpi.service_id and i.kind = 'servico'
  join public.tickets t on t.id = i.ticket_id
  where cpi.customer_package_id in (
      select customer_package_id from public.ticket_items
      where ticket_id = p_ticket and kind = 'servico' and customer_package_id is not null
    )
    and t.status <> 'cancelada'
  group by cpi.id, cpi.service_name, cpi.quantity_total
  having sum(i.quantity) > cpi.quantity_total
  limit 1;
  if v_bad is not null then
    raise exception 'Saldo insuficiente de % no pacote do cliente.', v_bad using errcode = '22023';
  end if;

  select coalesce(sum(quantity * unit_price_cents), 0) into v_sub
  from public.ticket_items
  where ticket_id = p_ticket
    and not (kind = 'servico' and customer_package_id is not null);
  return v_sub;
end;
$$;

revoke all on function public.replace_ticket_items(uuid, uuid, jsonb) from public, anon;
grant execute on function public.replace_ticket_items(uuid, uuid, jsonb) to authenticated, service_role;
