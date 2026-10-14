-- =============================================================================
-- Clientes (cadastro único da rede)
-- =============================================================================
-- O cliente é DA REDE: o mesmo cadastro vale em qualquer unidade. A unidade onde foi
-- cadastrado pela primeira vez fica registrada em `created_unit_id` (nunca muda).
--
-- Quem lê e escreve: admin da rede e recepção de QUALQUER unidade (a recepção vê o
-- cliente inteiro, inclusive o histórico das outras unidades, como o negócio pediu).
-- Barbeiro não acessa a tabela (os dados do cliente na agenda virão por consultas
-- específicas, mais tarde). Sem DELETE: o cliente é desativado; exclusão/anonimização
-- por pedido do titular (LGPD) será uma rotina própria, feita pelo servidor.
--
-- `registered_via` diz de onde veio o cadastro: 'recepcao' (painel, ficha completa) ou
-- 'autocadastro' (o próprio cliente, na página pública, com poucos campos). Por isso quase
-- tudo é opcional no banco. O autocadastro grava pelo servidor (service_role).
-- =============================================================================

-- ---------- Funções de apoio ----------------------------------------------------

-- O usuário atual é recepção de ALGUMA unidade (vínculo, perfil e unidade ativos)?
create or replace function public.is_any_reception()
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
      and m.role = 'recepcao'
      and m.is_active
      and p.is_active
      and u.is_active
      and u.deleted_at is null
  );
$$;

grant execute on function public.is_any_reception() to authenticated, service_role;

-- Nomes das unidades da rede, para mostrar "onde foi cadastrado" / "em qual unidade foi a comanda"
-- mesmo quando a recepção não é da unidade citada (a RLS de `units` só deixa ver a própria).
-- Só devolve id, nome e slug, e só para admin e recepção.
create or replace function public.network_units()
returns table (id uuid, name text, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.name, u.slug
  from public.units u
  where u.deleted_at is null
    and (public.is_network_admin() or public.is_any_reception());
$$;

grant execute on function public.network_units() to authenticated, service_role;

-- ---------- Tabela --------------------------------------------------------------

create table public.customers (
  id                  uuid primary key default gen_random_uuid(),
  created_unit_id     uuid references public.units (id) on delete set null,
  registered_via      text not null default 'recepcao' check (registered_via in ('recepcao', 'autocadastro')),
  full_name           text not null check (length(btrim(full_name)) between 2 and 120),
  -- Nome sem acento e em minúsculas, para a busca da lista.
  search_name         text generated always as (
    translate(lower(full_name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
  ) stored,
  phone               text check (phone is null or phone ~ '^[1-9][1-9][0-9]{8,9}$'),
  email               text check (email is null or (length(email) <= 254 and email like '%_@_%.__%')),
  birth_date          date check (birth_date is null or birth_date between date '1900-01-01' and current_date),
  cpf                 text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  photo_path          text check (photo_path is null or photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$'),
  cep                 text check (cep is null or cep ~ '^[0-9]{8}$'),
  street              text check (street is null or length(street) <= 120),
  street_number       text check (street_number is null or length(street_number) <= 20),
  complement          text check (complement is null or length(complement) <= 60),
  neighborhood        text check (neighborhood is null or length(neighborhood) <= 80),
  city                text check (city is null or length(city) <= 80),
  state               text check (state is null or state ~ '^[A-Z]{2}$'),
  preferred_barber_id uuid references public.barbers (id) on delete set null,
  referral_source     text check (referral_source is null or referral_source in
                        ('indicacao', 'instagram', 'facebook', 'google', 'passou_em_frente', 'outro')),
  notes               text check (notes is null or length(notes) <= 1000),
  marketing_consent   boolean not null default false,
  consent_at          timestamptz,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Mesmo CPF não pode ser cadastrado duas vezes na rede.
create unique index customers_cpf_unique on public.customers (cpf) where cpf is not null;
create index customers_phone_idx on public.customers (phone);
create index customers_created_unit_idx on public.customers (created_unit_id);
create index customers_created_at_idx on public.customers (created_at desc);
create index customers_search_name_idx on public.customers (search_name text_pattern_ops);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------- RLS ---------------------------------------------------------------
alter table public.customers enable row level security;

create policy customers_select on public.customers
  for select to authenticated
  using (public.is_network_admin() or public.is_any_reception());

-- Cadastro pelo painel: a unidade de origem precisa ser uma unidade onde o usuário é recepção
-- (o admin pode cadastrar em qualquer uma).
create policy customers_insert on public.customers
  for insert to authenticated
  with check (
    public.is_network_admin()
    or (
      registered_via = 'recepcao'
      and created_unit_id is not null
      and public.has_unit_role(created_unit_id, array['recepcao']::public.app_role[])
    )
  );

create policy customers_update on public.customers
  for update to authenticated
  using (public.is_network_admin() or public.is_any_reception())
  with check (public.is_network_admin() or public.is_any_reception());

-- ---------- Privilégios -------------------------------------------------------
revoke all on public.customers from anon, authenticated;
grant select on public.customers to authenticated;
grant insert (
  id, created_unit_id, full_name, phone, email, birth_date, cpf, photo_path,
  cep, street, street_number, complement, neighborhood, city, state,
  preferred_barber_id, referral_source, notes, marketing_consent, consent_at, is_active
) on public.customers to authenticated;
-- created_unit_id, registered_via e created_at nunca mudam depois de criado.
grant update (
  full_name, phone, email, birth_date, cpf, photo_path,
  cep, street, street_number, complement, neighborhood, city, state,
  preferred_barber_id, referral_source, notes, marketing_consent, consent_at, is_active
) on public.customers to authenticated;
grant all on public.customers to service_role;

-- ---------- Foto do cliente (Storage) ---------------------------------------------
-- Bucket público para LEITURA, 1 MB, só webp/jpeg/png. Escrita: admin ou recepção de
-- qualquer unidade, com nome `<customer_id>.<webp|jpg|png>` (sem pastas).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-photos', 'customer-photos', true, 1048576,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.customer_photo_name_ok(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$';
$$;

grant execute on function public.customer_photo_name_ok(text) to authenticated, service_role;

create policy customer_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'customer-photos' and (public.is_network_admin() or public.is_any_reception()));

create policy customer_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-photos'
    and public.customer_photo_name_ok(name)
    and (public.is_network_admin() or public.is_any_reception())
  );

create policy customer_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'customer-photos' and (public.is_network_admin() or public.is_any_reception()))
  with check (
    bucket_id = 'customer-photos'
    and public.customer_photo_name_ok(name)
    and (public.is_network_admin() or public.is_any_reception())
  );

create policy customer_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'customer-photos' and (public.is_network_admin() or public.is_any_reception()));
