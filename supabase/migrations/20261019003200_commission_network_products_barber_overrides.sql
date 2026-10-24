-- Comissão definida pelo admin da rede, com exceção por profissional.
-- Serviços: tabela progressiva da rede (commission_brackets, migration 027).
-- Produtos: percentual único da rede (commission_settings, linha única).
-- Por profissional, `barbers.commission_services_pct` e
-- `barbers.commission_products_pct` viram o percentual PRÓPRIO dele: quando
-- preenchido, vale ele (fora da regra da rede); quando null, segue a rede.
-- Antes essas colunas eram not null com o % "de verdade"; viram nullable.

alter table public.barbers
  alter column commission_services_pct drop not null,
  alter column commission_services_pct set default null,
  alter column commission_products_pct drop not null,
  alter column commission_products_pct set default null;

-- Configuração única da rede (uma linha só).
create table public.commission_settings (
  id boolean primary key default true check (id),
  products_pct numeric(5, 2) not null default 10 check (products_pct >= 0 and products_pct <= 100),
  updated_at timestamptz not null default now()
);

insert into public.commission_settings (id, products_pct) values (true, 10);

alter table public.commission_settings enable row level security;

-- Leitura: qualquer usuário logado (a área de Comissões das unidades lê).
create policy commission_settings_select on public.commission_settings
  for select to authenticated using (true);

-- Escrita: só o admin da rede.
create policy commission_settings_write on public.commission_settings
  for all to authenticated
  using (public.is_network_admin())
  with check (public.is_network_admin());
