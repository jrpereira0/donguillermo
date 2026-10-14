-- =============================================================================
-- Quais profissionais fazem cada serviço (barber_services)
-- =============================================================================
-- Tabela de ligação barbeiro x serviço. Chaves compostas com unit_id garantem que
-- o barbeiro e o serviço são da MESMA unidade (nunca dá para cruzar unidades).
-- Quem escreve: admin da rede ou recepção da unidade (INSERT/DELETE; não há UPDATE:
-- a ligação existe ou não existe). Quem lê: admin e quem é da unidade.
-- Serviço sem nenhuma ligação = ninguém habilitado ainda (a agenda decide o que fazer).
-- =============================================================================

create unique index barbers_id_unit_unique on public.barbers (id, unit_id);
create unique index services_id_unit_unique on public.services (id, unit_id);

create table public.barber_services (
  barber_id  uuid not null,
  service_id uuid not null,
  unit_id    uuid not null references public.units (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (barber_id, service_id),
  constraint barber_services_barber_fk
    foreign key (barber_id, unit_id) references public.barbers (id, unit_id) on delete cascade,
  constraint barber_services_service_fk
    foreign key (service_id, unit_id) references public.services (id, unit_id) on delete cascade
);

create index barber_services_service_idx on public.barber_services (service_id);
create index barber_services_unit_idx on public.barber_services (unit_id);

-- ---------- RLS ---------------------------------------------------------------
alter table public.barber_services enable row level security;

create policy barber_services_select on public.barber_services
  for select to authenticated
  using (public.is_network_admin() or public.is_unit_member(unit_id));

create policy barber_services_insert on public.barber_services
  for insert to authenticated
  with check (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

create policy barber_services_delete on public.barber_services
  for delete to authenticated
  using (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

-- ---------- Privilégios -------------------------------------------------------
revoke all on public.barber_services from anon, authenticated;
grant select, insert, delete on public.barber_services to authenticated;
grant all on public.barber_services to service_role;
