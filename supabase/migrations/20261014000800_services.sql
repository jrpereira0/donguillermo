-- =============================================================================
-- Recepção - Serviços: catálogo de serviços da unidade
-- =============================================================================
-- services: 1 linha por serviço e por unidade (nome, categoria, duração, preço).
-- Preço em CENTAVOS (inteiro) para nunca ter erro de arredondamento.
-- Quem escreve:
--   * INSERT/UPDATE: admin da rede ou recepção DA UNIDADE, direto pela sessão do
--     usuário (a RLS confere a unidade; unit_id nunca muda por update).
--   * Sem DELETE: o serviço é desativado (is_active = false) e some das listas e
--     da agenda, mas o histórico continua apontando para ele.
-- Quem lê: admin, recepção e barbeiros da unidade (o barbeiro precisa ver o catálogo
-- para a própria agenda).
-- =============================================================================

create table public.services (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units (id) on delete cascade,
  name             text not null check (length(btrim(name)) between 2 and 80),
  description      text check (description is null or length(description) <= 300),
  category         text not null default 'cabelo'
                   check (category in ('cabelo', 'barba', 'combo', 'sobrancelha', 'tratamento', 'outros')),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  price_cents      integer not null check (price_cents between 0 and 10000000),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Nome único por unidade (sem diferenciar maiúsculas/minúsculas nem espaços nas pontas).
create unique index services_unit_name_unique on public.services (unit_id, lower(btrim(name)));
create index services_unit_id_idx on public.services (unit_id);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ---------- RLS ---------------------------------------------------------------
alter table public.services enable row level security;

create policy services_select on public.services
  for select to authenticated
  using (public.is_network_admin() or public.is_unit_member(unit_id));

create policy services_insert on public.services
  for insert to authenticated
  with check (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

create policy services_update on public.services
  for update to authenticated
  using (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  )
  with check (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

-- ---------- Privilégios -------------------------------------------------------
revoke all on public.services from anon, authenticated;
grant select on public.services to authenticated;
grant insert (unit_id, name, description, category, duration_minutes, price_cents, is_active)
  on public.services to authenticated;
grant update (name, description, category, duration_minutes, price_cents, is_active)
  on public.services to authenticated;
grant all on public.services to service_role;
