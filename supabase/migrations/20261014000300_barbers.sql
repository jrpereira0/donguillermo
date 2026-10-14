-- =============================================================================
-- Recepção - Profissionais: cadastro de barbeiros
-- =============================================================================
-- barbers: 1 linha por barbeiro e por unidade. O login (auth.users/profiles) é
-- opcional no banco (user_id pode ser NULL), mas a tela sempre cria o login.
-- Quem escreve:
--   * INSERT: só o servidor (service_role), depois de validar recepção/admin e
--     criar a conta. O papel `authenticated` não tem INSERT (defesa em profundidade).
--   * UPDATE: admin da rede ou recepção DA UNIDADE, só nas colunas listadas
--     (unit_id e user_id nunca mudam por aqui).
--   * Sem DELETE: o barbeiro é desativado (is_active = false).
-- Quem lê: admin, recepção da unidade e o próprio barbeiro (só a sua linha).
-- Dados pessoais (CPF, nascimento) ficam restritos a esses perfis (LGPD).
-- =============================================================================

create table public.barbers (
  id                       uuid primary key default gen_random_uuid(),
  unit_id                  uuid not null references public.units (id) on delete cascade,
  user_id                  uuid references public.profiles (id) on delete set null,
  full_name                text not null check (length(btrim(full_name)) between 2 and 120),
  display_name             text not null check (length(btrim(display_name)) between 2 and 40),
  phone                    text check (phone is null or length(phone) <= 30),
  birth_date               date check (birth_date is null or birth_date between date '1900-01-01' and current_date),
  cpf                      text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  photo_path               text,
  social                   jsonb not null default '{}'::jsonb check (jsonb_typeof(social) = 'object'),
  commission_services_pct  numeric(5, 2) not null default 0 check (commission_services_pct between 0 and 100),
  commission_products_pct  numeric(5, 2) not null default 0 check (commission_products_pct between 0 and 100),
  work_hours               jsonb check (work_hours is null or jsonb_typeof(work_hours) = 'object'),
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- A foto só pode apontar para a pasta da própria unidade no Storage.
  constraint barbers_photo_in_unit_folder
    check (photo_path is null or photo_path like unit_id::text || '/%')
);

create unique index barbers_unit_user_unique on public.barbers (unit_id, user_id) where user_id is not null;
create unique index barbers_unit_cpf_unique  on public.barbers (unit_id, cpf)     where cpf is not null;
create index barbers_unit_id_idx on public.barbers (unit_id);

create trigger barbers_set_updated_at
  before update on public.barbers
  for each row execute function public.set_updated_at();

-- ---------- RLS ---------------------------------------------------------------
alter table public.barbers enable row level security;

create policy barbers_select on public.barbers
  for select to authenticated
  using (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
    or (user_id = (select auth.uid()) and public.is_unit_member(unit_id))
  );

create policy barbers_update on public.barbers
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
revoke all on public.barbers from anon, authenticated;
grant select on public.barbers to authenticated;
grant update (
  full_name, display_name, phone, birth_date, cpf, photo_path, social,
  commission_services_pct, commission_products_pct, work_hours, is_active
) on public.barbers to authenticated;
grant all on public.barbers to service_role;
