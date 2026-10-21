-- Pacotes pré-pagos da unidade.
-- Catálogo: pacote = conjunto de serviços (com quantidades) com desconto em %.
-- Venda: lança uma comanda com o item do pacote; ao cobrar essa comanda, o pacote
-- do cliente ATIVA. Nas visitas seguintes, o serviço entra na comanda "pelo pacote"
-- (ticket_items.customer_package_id): não cobra de novo (já pago), mas vale o preço
-- cheio para produção/comissão do barbeiro. Saldo = contratado − usado em comandas
-- não canceladas (apagar o item da comanda devolve o saldo automaticamente).

-- ---------- Catálogo ----------------------------------------------------------
create table public.packages (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 2 and 80),
  description   text check (description is null or length(description) <= 300),
  discount_pct  numeric(5, 2) not null default 0 check (discount_pct between 0 and 90),
  validity_days integer check (validity_days is null or validity_days between 1 and 730),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index packages_unit_name_unique on public.packages (unit_id, lower(btrim(name)));
create index packages_unit_active_idx on public.packages (unit_id, is_active, name);

create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

create table public.package_items (
  id         uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  unit_id    uuid not null,
  service_id uuid not null,
  quantity   smallint not null check (quantity between 1 and 50),
  position   smallint not null default 0 check (position >= 0),
  constraint package_items_service_fk
    foreign key (service_id, unit_id) references public.services (id, unit_id),
  constraint package_items_package_unique unique (package_id, service_id)
);

create index package_items_package_idx on public.package_items (package_id);

-- ---------- Pacote do cliente (venda) ------------------------------------------
create table public.customer_packages (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units (id) on delete cascade,
  customer_id   uuid not null references public.customers (id) on delete cascade,
  package_id    uuid references public.packages (id) on delete set null,
  package_name  text not null check (length(btrim(package_name)) between 1 and 80),
  discount_pct  numeric(5, 2) not null check (discount_pct between 0 and 90),
  list_cents    integer not null check (list_cents between 0 and 100000000),
  price_cents   integer not null check (price_cents between 0 and 100000000),
  validity_days integer check (validity_days is null or validity_days between 1 and 730),
  status        text not null default 'pendente' check (status in ('pendente', 'ativa', 'cancelada')),
  sold_ticket_id uuid,
  sold_at       timestamptz not null default now(),
  activated_at  timestamptz,
  expires_at    timestamptz,
  constraint customer_packages_ticket_fk
    foreign key (sold_ticket_id, unit_id) references public.tickets (id, unit_id) on delete set null
);

create index customer_packages_customer_idx
  on public.customer_packages (unit_id, customer_id, sold_at desc);
create index customer_packages_ticket_idx
  on public.customer_packages (sold_ticket_id) where sold_ticket_id is not null;

create table public.customer_package_items (
  id                  uuid primary key default gen_random_uuid(),
  customer_package_id uuid not null references public.customer_packages (id) on delete cascade,
  unit_id             uuid not null,
  service_id          uuid,
  service_name        text not null check (length(btrim(service_name)) between 1 and 80),
  quantity_total      smallint not null check (quantity_total between 1 and 50),
  unit_price_cents    integer not null check (unit_price_cents between 0 and 10000000),
  constraint customer_package_items_service_fk
    foreign key (service_id, unit_id) references public.services (id, unit_id),
  constraint customer_package_items_unique unique (customer_package_id, service_name)
);

create index customer_package_items_cp_idx on public.customer_package_items (customer_package_id);

-- ---------- Itens da comanda: venda e uso de pacote -----------------------------
alter table public.ticket_items
  drop constraint if exists ticket_items_kind_check;
alter table public.ticket_items
  add constraint ticket_items_kind_check check (kind in ('servico', 'produto', 'pacote'));

alter table public.ticket_items
  add column if not exists customer_package_id uuid references public.customer_packages (id) on delete set null;
alter table public.ticket_items
  add column if not exists package_id uuid references public.packages (id) on delete set null;

create index ticket_items_customer_package_idx
  on public.ticket_items (customer_package_id) where customer_package_id is not null;

-- Troca os itens da comanda aberta validando pacotes no servidor e devolve o
-- subtotal COBRÁVEL (serviço usado pelo pacote não entra: já foi pago na venda).
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

  -- Uso de pacote: pacote do cliente desta comanda, ativo, dentro da validade,
  -- serviço contratado e saldo suficiente (uso = itens em comandas não canceladas).
  select i.name into v_bad
  from public.ticket_items i
  left join public.customer_packages cp on cp.id = i.customer_package_id
  where i.ticket_id = p_ticket and i.kind = 'servico' and i.customer_package_id is not null
    and (
      cp.id is null
      or cp.unit_id <> p_unit
      or cp.customer_id is distinct from v_customer
      or cp.status <> 'ativa'
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

-- Cobrar a comanda da venda ATIVA o pacote; cancelar a venda (ainda aberta) cancela.
create or replace function public.customer_packages_on_ticket_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'fechada' and old.status is distinct from 'fechada' then
    update public.customer_packages cp set
      status = 'ativa',
      activated_at = now(),
      expires_at = case
        when cp.validity_days is null then null
        else now() + make_interval(days => cp.validity_days)
      end
    where cp.sold_ticket_id = new.id
      and cp.status = 'pendente'
      and exists (
        select 1 from public.ticket_items i
        where i.ticket_id = new.id and i.kind = 'pacote' and i.customer_package_id = cp.id
      );
  elsif new.status = 'cancelada' and old.status is distinct from 'cancelada' then
    update public.customer_packages cp set status = 'cancelada'
    where cp.sold_ticket_id = new.id and cp.status = 'pendente';
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_customer_packages_status on public.tickets;
create trigger tickets_customer_packages_status
  after update of status on public.tickets
  for each row execute function public.customer_packages_on_ticket_status();

-- Reabrir a comanda da venda volta o pacote para pendente (precisa cobrar de novo).
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

  update public.customer_packages set
    status = 'pendente',
    activated_at = null,
    expires_at = null
  where sold_ticket_id = v_ticket.id and status = 'ativa';

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

-- ---------- RLS ------------------------------------------------------------------
alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.customer_packages enable row level security;
alter table public.customer_package_items enable row level security;

create policy packages_select on public.packages
  for select to authenticated
  using (public.is_network_admin() or public.is_unit_member(unit_id));
create policy packages_insert on public.packages
  for insert to authenticated
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));
create policy packages_update on public.packages
  for update to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]))
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

create policy package_items_select on public.package_items
  for select to authenticated
  using (public.is_network_admin() or public.is_unit_member(unit_id));
create policy package_items_write on public.package_items
  for all to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]))
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

create policy customer_packages_select on public.customer_packages
  for select to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));
create policy customer_packages_insert on public.customer_packages
  for insert to authenticated
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));
create policy customer_packages_update on public.customer_packages
  for update to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]))
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

create policy customer_package_items_select on public.customer_package_items
  for select to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));
create policy customer_package_items_insert on public.customer_package_items
  for insert to authenticated
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

revoke all on public.packages, public.package_items, public.customer_packages, public.customer_package_items
  from anon, authenticated;

grant select on public.packages to authenticated;
grant insert (unit_id, name, description, discount_pct, validity_days, is_active) on public.packages to authenticated;
grant update (name, description, discount_pct, validity_days, is_active) on public.packages to authenticated;

grant select, insert, update, delete on public.package_items to authenticated;
grant select, insert, update on public.customer_packages to authenticated;
grant select, insert on public.customer_package_items to authenticated;

grant all on public.packages, public.package_items, public.customer_packages, public.customer_package_items
  to service_role;
