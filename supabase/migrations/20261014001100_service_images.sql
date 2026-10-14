-- =============================================================================
-- Imagem do serviço (Supabase Storage + coluna services.image_path)
-- =============================================================================
-- Bucket público para LEITURA (a imagem aparecerá na página pública de
-- agendamento), com limites aplicados pelo Storage: 1 MB e só webp/jpeg/png.
-- ESCRITA: só admin da rede ou recepção da unidade, e só dentro da pasta da
-- unidade, com nome `<unit_id>/<service_id>.<webp|jpg|png>` (mesmas funções
-- auxiliares das fotos dos profissionais).
-- =============================================================================

alter table public.services
  add column image_path text,
  add constraint services_image_path_unit
    check (image_path is null or image_path like unit_id::text || '/%');

-- O id pode vir do formulário (para o nome do arquivo existir antes do cadastro).
grant insert (id, image_path) on public.services to authenticated;
grant update (image_path) on public.services to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-images', 'service-images', true, 1048576,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy service_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'service-images'
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );

create policy service_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'service-images'
    and public.photo_name_ok(name)
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );

create policy service_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'service-images'
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  )
  with check (
    bucket_id = 'service-images'
    and public.photo_name_ok(name)
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );

create policy service_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'service-images'
    and (
      public.is_network_admin()
      or public.has_unit_role(public.photo_unit_id(name), array['recepcao']::public.app_role[])
    )
  );
