-- =============================================================================
-- Configurações da barbearia (unidade)
-- =============================================================================
-- A unidade ganha: CNPJ, endereço em campos (com CEP), lista de telefones com rótulo,
-- tempo de cada linha da agenda (`slot_minutes`), logo e foto de capa.
--
-- Quem edita: admin da rede e a RECEPÇÃO da própria unidade. A recepção NUNCA muda
-- slug, situação (is_active) nem exclusão lógica (o gatilho abaixo barra).
--
-- `address` e `phone` continuam existindo (painel da rede e cartões da lista):
-- a aplicação grava neles o endereço em uma linha e o primeiro telefone.
-- =============================================================================

alter table public.units
  add column cnpj          text check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  add column cep           text check (cep is null or cep ~ '^[0-9]{8}$'),
  add column street        text check (street is null or length(street) <= 120),
  add column street_number text check (street_number is null or length(street_number) <= 20),
  add column complement    text check (complement is null or length(complement) <= 60),
  add column neighborhood  text check (neighborhood is null or length(neighborhood) <= 80),
  add column city          text check (city is null or length(city) <= 80),
  add column state         text check (state is null or state ~ '^[A-Z]{2}$'),
  -- [{ "label": "Recepção", "number": "11912345678", "whatsapp": true }, ...] (até 5)
  add column phones        jsonb not null default '[]'::jsonb
    check (jsonb_typeof(phones) = 'array' and jsonb_array_length(phones) <= 5),
  -- Tempo de cada linha da agenda, em minutos.
  add column slot_minutes  smallint not null default 30
    check (slot_minutes in (5, 10, 15, 20, 30, 60)),
  add column logo_path     text,
  add column cover_path    text;

alter table public.units
  add constraint units_logo_in_unit_folder
    check (logo_path is null or logo_path like id::text || '/%'),
  add constraint units_cover_in_unit_folder
    check (cover_path is null or cover_path like id::text || '/%');

-- ---------- Quem pode atualizar ------------------------------------------------
drop policy units_update on public.units;

create policy units_update on public.units
  for update to authenticated
  using (
    public.is_network_admin()
    or public.has_unit_role(id, array['recepcao']::public.app_role[])
  )
  with check (
    public.is_network_admin()
    or public.has_unit_role(id, array['recepcao']::public.app_role[])
  );

-- Privilégio por coluna não separa admin de recepção (os dois usam o papel `authenticated`),
-- então o que só o admin pode mudar é protegido por gatilho. Sem sessão de usuário
-- (service_role, migrations) nada é bloqueado.
create or replace function public.units_guard_reception_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_network_admin() then
    if new.id is distinct from old.id
       or new.slug is distinct from old.slug
       or new.is_active is distinct from old.is_active
       or new.deleted_at is distinct from old.deleted_at
       or new.created_at is distinct from old.created_at then
      raise exception 'Somente o administrador da rede altera slug, situação ou exclusão da unidade.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger units_guard_reception_update
  before update on public.units
  for each row execute function public.units_guard_reception_update();

-- ---------- Logo e capa (Storage) ------------------------------------------------
-- Bucket público para LEITURA (aparecerão na página pública de agendamento), 2 MB, só
-- webp/jpeg/png. Escrita: admin ou recepção da unidade, na pasta da unidade, com nome
-- `<unit_id>/<uuid>.<webp|jpg|png>` (cada envio ganha um nome novo; o antigo é removido).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'unit-assets', 'unit-assets', true, 2097152,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy unit_assets_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'unit-assets'
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );

create policy unit_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'unit-assets'
    and public.photo_name_ok(name)
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );

create policy unit_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'unit-assets'
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  )
  with check (
    bucket_id = 'unit-assets'
    and public.photo_name_ok(name)
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );

create policy unit_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'unit-assets'
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );
