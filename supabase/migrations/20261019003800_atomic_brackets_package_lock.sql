-- Duas correções de concorrência/atomicidade:
--
-- 1) Tabela de faixas de comissão: o painel apagava todas as faixas e depois
--    inseria as novas em duas chamadas separadas. Se a inserção falhasse, a
--    rede ficava sem tabela e a comissão de serviços calculava 0 para todos
--    (foi o que a migration 035 precisou remendar). Agora a troca é uma única
--    função: apaga, valida e insere na mesma transação — ou tudo, ou nada.
--
-- 2) Saldo de pacote: replace_ticket_items conferia o saldo sem travar o
--    pacote. Duas comandas baixando o mesmo pacote ao mesmo tempo passavam
--    ambas na conferência (uma não enxerga os itens ainda não confirmados da
--    outra). Agora os pacotes usados na comanda são travados (FOR UPDATE)
--    antes da conferência: a segunda espera a primeira terminar e, ao seguir,
--    já enxerga os itens gravados por ela.

create or replace function public.replace_commission_brackets(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bad text;
  v_n integer;
begin
  if not public.is_network_admin() then
    raise exception 'Só o administrador da rede altera a tabela de comissão.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 40 then
    raise exception 'A tabela precisa de 1 a 40 faixas.' using errcode = '22023';
  end if;

  -- Mesma regra do editor (validateBrackets): faixas em ordem, sem buraco nem
  -- sobreposição, % entre 0 e 100 e "sem teto" só na última.
  with r as (
    select
      e.idx,
      (e.elem ->> 'min_cents')::integer as min_cents,
      nullif(e.elem ->> 'max_cents', '')::integer as max_cents,
      (e.elem ->> 'pct')::numeric as pct,
      lag(nullif(e.elem ->> 'max_cents', '')::integer) over (order by e.idx) as prev_max,
      count(*) over () as total
    from jsonb_array_elements(p_rows) with ordinality as e(elem, idx)
  )
  select format('Faixa %s', r.idx) into v_bad
  from r
  where r.min_cents is null or r.min_cents < 0
    or r.pct is null or r.pct < 0 or r.pct > 100
    or (r.max_cents is not null and r.max_cents < r.min_cents)
    or (r.max_cents is null and r.idx < r.total)
    or (r.idx > 1 and (r.prev_max is null or r.min_cents <> r.prev_max + 1))
  order by r.idx
  limit 1;
  if v_bad is not null then
    raise exception '%: tabela inválida (faixas em ordem, sem buraco nem sobreposição, percentual entre 0 e 100).', v_bad
      using errcode = '22023';
  end if;

  -- Dois admins salvando ao mesmo tempo: um espera o outro (leituras seguem livres).
  lock table public.commission_brackets in share row exclusive mode;

  delete from public.commission_brackets where id is not null;

  insert into public.commission_brackets (min_cents, max_cents, pct)
  select
    (e.elem ->> 'min_cents')::integer,
    nullif(e.elem ->> 'max_cents', '')::integer,
    round((e.elem ->> 'pct')::numeric, 2)
  from jsonb_array_elements(p_rows) with ordinality as e(elem, idx)
  order by e.idx;
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

revoke all on function public.replace_commission_brackets(jsonb) from public, anon;
grant execute on function public.replace_commission_brackets(jsonb) to authenticated, service_role;

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

  -- Trava os pacotes usados nesta comanda antes de conferir o saldo (ordem por
  -- id para duas comandas nunca travarem em ordem cruzada).
  perform 1
  from public.customer_packages cp
  where cp.unit_id = p_unit
    and cp.id in (
      select nullif(e.elem ->> 'customer_package_id', '')::uuid
      from jsonb_array_elements(p_items) as e(elem)
    )
  order by cp.id
  for update;

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

notify pgrst, 'reload schema';
