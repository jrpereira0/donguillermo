-- =============================================================================
-- Etapa 2 — Banco base: unidades, perfis, papéis e RLS
-- =============================================================================
-- Modelo:
--   units         : as unidades (tenants) da rede
--   profiles      : 1 linha por usuário do Auth (criada por trigger)
--   unit_members  : (usuário, unidade, papel). admin_rede tem unit_id NULL
--                   (vale para a rede toda); recepcao/barbeiro exigem unit_id.
-- Isolamento: RLS em todas as tabelas. Funções auxiliares SECURITY DEFINER
-- evitam recursão de policies e centralizam a regra de acesso.
-- =============================================================================

-- ---------- Tipos -------------------------------------------------------------
create type public.app_role as enum ('admin_rede', 'recepcao', 'barbeiro');

-- ---------- Utilitário: updated_at -------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- units -------------------------------------------------------------
create table public.units (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  name          text not null check (length(btrim(name)) between 2 and 120),
  address       text,
  phone         text,
  opening_hours jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger units_set_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

-- ---------- profiles ----------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- unit_members ------------------------------------------------------
create table public.unit_members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  unit_id    uuid references public.units (id) on delete cascade,
  role       public.app_role not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_members_scope check (
    (role = 'admin_rede' and unit_id is null)
    or (role <> 'admin_rede' and unit_id is not null)
  )
);

-- Um usuário não pode ter o mesmo papel duplicado na mesma unidade
-- (coalesce trata o admin_rede, cujo unit_id é NULL).
create unique index unit_members_unique
  on public.unit_members (user_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid), role);
create index unit_members_unit_id_idx on public.unit_members (unit_id);
create index unit_members_user_id_idx on public.unit_members (user_id);

create trigger unit_members_set_updated_at
  before update on public.unit_members
  for each row execute function public.set_updated_at();

-- ---------- Trigger: cria o profile quando nasce um usuário no Auth -----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do profile em sincronia com o Auth.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------- Funções de autorização (usadas pelas policies) --------------------
-- SECURITY DEFINER: leem unit_members/profiles/units sem passar pela RLS,
-- o que evita recursão infinita. Sempre baseadas em auth.uid().

create or replace function public.is_network_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unit_members m
    join public.profiles p on p.id = m.user_id
    where m.user_id = (select auth.uid())
      and m.role = 'admin_rede'
      and m.is_active
      and p.is_active
  );
$$;

-- O usuário atual tem um dos papéis informados NESTA unidade?
-- Exige vínculo ativo, perfil ativo e unidade ativa e não excluída.
create or replace function public.has_unit_role(p_unit_id uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unit_members m
    join public.profiles p on p.id = m.user_id
    join public.units u on u.id = m.unit_id
    where m.user_id = (select auth.uid())
      and m.unit_id = p_unit_id
      and m.role = any (p_roles)
      and m.is_active
      and p.is_active
      and u.is_active
      and u.deleted_at is null
  );
$$;

create or replace function public.is_unit_member(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_unit_role(p_unit_id, array['recepcao', 'barbeiro']::public.app_role[]);
$$;

-- O usuário atual é recepção de alguma unidade onde o usuário-alvo também tem vínculo?
create or replace function public.is_recepcao_of_user(p_target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unit_members me
    join public.unit_members other on other.unit_id = me.unit_id
    where me.user_id = (select auth.uid())
      and me.role = 'recepcao'
      and me.unit_id is not null
      and other.user_id = p_target_user
      and public.has_unit_role(me.unit_id, array['recepcao']::public.app_role[])
  );
$$;

-- Funções não devem ser chamáveis por anônimos.
revoke execute on function public.is_network_admin() from public, anon;
revoke execute on function public.has_unit_role(uuid, public.app_role[]) from public, anon;
revoke execute on function public.is_unit_member(uuid) from public, anon;
revoke execute on function public.is_recepcao_of_user(uuid) from public, anon;
grant execute on function public.is_network_admin() to authenticated, service_role;
grant execute on function public.has_unit_role(uuid, public.app_role[]) to authenticated, service_role;
grant execute on function public.is_unit_member(uuid) to authenticated, service_role;
grant execute on function public.is_recepcao_of_user(uuid) to authenticated, service_role;

-- ---------- RLS ---------------------------------------------------------------
alter table public.units        enable row level security;
alter table public.profiles     enable row level security;
alter table public.unit_members enable row level security;

-- units: admin vê todas; recepção/barbeiro veem só a(s) própria(s) (ativas).
create policy units_select on public.units
  for select to authenticated
  using (public.is_network_admin() or public.is_unit_member(id));

create policy units_insert on public.units
  for insert to authenticated
  with check (public.is_network_admin());

create policy units_update on public.units
  for update to authenticated
  using (public.is_network_admin())
  with check (public.is_network_admin());
-- Sem policy de DELETE: unidades usam exclusão lógica (deleted_at).

-- profiles: o próprio; admin vê todos; recepção vê quem é da sua unidade.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_network_admin()
    or public.is_recepcao_of_user(id)
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- Sem INSERT/DELETE: o profile nasce por trigger; remoção segue o Auth.

-- unit_members: o próprio vínculo; admin vê todos; recepção vê os da sua unidade.
create policy unit_members_select on public.unit_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

create policy unit_members_insert on public.unit_members
  for insert to authenticated
  with check (public.is_network_admin());

create policy unit_members_update on public.unit_members
  for update to authenticated
  using (public.is_network_admin())
  with check (public.is_network_admin());

create policy unit_members_delete on public.unit_members
  for delete to authenticated
  using (public.is_network_admin());

-- ---------- Privilégios de tabela (defesa em profundidade, além da RLS) -------
revoke all on public.units, public.profiles, public.unit_members from anon, authenticated;

grant select, insert, update on public.units to authenticated;
grant select on public.profiles to authenticated;
-- Usuário comum só edita o próprio nome/telefone; is_active/email não.
grant update (full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.unit_members to authenticated;

grant all on public.units, public.profiles, public.unit_members to service_role;
