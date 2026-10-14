-- =============================================================================
-- Fotos dos profissionais (Supabase Storage)
-- =============================================================================
-- Bucket público para LEITURA (a foto aparecerá na página pública de
-- agendamento), com limites aplicados pelo próprio Storage: 1 MB e só
-- webp/jpeg/png. ESCRITA: só admin da rede ou recepção da unidade, e só dentro
-- da pasta da unidade, com nome `<unit_id>/<barber_id>.<webp|jpg|png>`.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'barber-photos', 'barber-photos', true, 1048576,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Extrai o unit_id da primeira pasta do caminho; NULL se não for um UUID
-- (assim um nome malformado nunca autoriza nada nem dá erro de cast).
create or replace function public.photo_unit_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
  end;
$$;

grant execute on function public.photo_unit_id(text) to authenticated, service_role;

-- Nome permitido: <unit_id>/<barber_id>.(webp|jpg|png)
create or replace function public.photo_name_ok(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$';
$$;

grant execute on function public.photo_name_ok(text) to authenticated, service_role;

create policy barber_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'barber-photos'
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );

create policy barber_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'barber-photos'
    and public.photo_name_ok(name)
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );

create policy barber_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'barber-photos'
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  )
  with check (
    bucket_id = 'barber-photos'
    and public.photo_name_ok(name)
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );

create policy barber_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'barber-photos'
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );
