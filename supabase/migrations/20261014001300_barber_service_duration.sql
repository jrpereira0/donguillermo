-- =============================================================================
-- Duração própria do profissional em cada serviço
-- =============================================================================
-- O serviço tem uma duração padrão (services.duration_minutes). Quando um
-- profissional leva mais ou menos tempo, a ligação guarda a duração dele.
-- NULL = usa a duração padrão do serviço.
-- =============================================================================

alter table public.barber_services
  add column duration_minutes integer
    check (duration_minutes is null or duration_minutes between 5 and 480);

-- A ligação agora pode ser editada, mas só a duração (barbeiro/serviço/unidade nunca mudam).
create policy barber_services_update on public.barber_services
  for update to authenticated
  using (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  )
  with check (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

grant update (duration_minutes) on public.barber_services to authenticated;
