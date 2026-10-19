-- Catálogo de produtos da unidade (o que a recepção vende na comanda).
-- Preço em centavos. Sem exclusão: produto sai de venda ao ser desativado.

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 2 and 80),
  description text check (description is null or length(description) <= 300),
  category    text not null default 'outros'
              check (category in ('cabelo', 'barba', 'pele', 'perfume', 'outros')),
  price_cents integer not null check (price_cents between 0 and 10000000),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index products_unit_name_unique on public.products (unit_id, lower(btrim(name)));
create index products_unit_active_idx on public.products (unit_id, is_active, name);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

create policy products_select on public.products
  for select to authenticated
  using (public.is_network_admin() or public.is_unit_member(unit_id));

create policy products_insert on public.products
  for insert to authenticated
  with check (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

create policy products_update on public.products
  for update to authenticated
  using (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  )
  with check (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

revoke all on public.products from anon, authenticated;
grant select on public.products to authenticated;
grant insert (unit_id, name, description, category, price_cents, is_active)
  on public.products to authenticated;
grant update (name, description, category, price_cents, is_active)
  on public.products to authenticated;
grant all on public.products to service_role;
