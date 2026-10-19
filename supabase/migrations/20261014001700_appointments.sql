-- =============================================================================
-- Agenda: agendamentos e bloqueios de horário
-- =============================================================================
-- Uma só tabela (`appointments`) guarda os dois tipos de ocupação do profissional:
--   kind = 'appointment' : atendimento de um cliente (cadastrado ou avulso, com nome e telefone);
--   kind = 'block'       : bloqueio de horário (folga, almoço extra, manutenção...).
-- Assim UMA constraint de exclusão impede dois agendamentos (ou um agendamento e um
-- bloqueio) sobrepostos para o mesmo profissional, mesmo com acessos simultâneos.
-- Agendamento cancelado ou com falta NÃO ocupa o horário.
--
-- Cada agendamento guarda a "foto" dos serviços na hora da marcação (nome, duração e preço):
-- mudar o catálogo depois não altera o que já foi marcado. O nome e o telefone do cliente
-- também são gravados no agendamento (o barbeiro, que não lê a tabela de clientes, enxerga
-- o nome por aqui).
-- =============================================================================

create extension if not exists btree_gist;

-- ---------- Tabela ------------------------------------------------------------
create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units (id) on delete cascade,
  barber_id        uuid not null,
  kind             text not null default 'appointment' check (kind in ('appointment', 'block')),
  customer_id      uuid references public.customers (id) on delete set null,
  customer_name    text check (customer_name is null or length(btrim(customer_name)) between 2 and 120),
  customer_phone   text check (customer_phone is null or customer_phone ~ '^[1-9][1-9][0-9]{8,9}$'),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           text not null default 'agendado'
                   check (status in ('agendado', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'faltou')),
  -- Observação do agendamento ou motivo do bloqueio.
  notes            text check (notes is null or length(notes) <= 500),
  created_by       uuid references auth.users (id) on delete set null,
  created_by_name  text check (created_by_name is null or length(created_by_name) <= 120),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint appointments_id_unit_unique unique (id, unit_id),
  -- O profissional precisa ser da mesma unidade do agendamento.
  constraint appointments_barber_fk
    foreign key (barber_id, unit_id) references public.barbers (id, unit_id) on delete cascade,
  constraint appointments_period_check
    check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours'),
  constraint appointments_shape_check check (
    (kind = 'appointment' and customer_name is not null)
    or (kind = 'block' and customer_id is null and customer_name is null
        and customer_phone is null and status = 'agendado')
  ),
  -- Sem sobreposição por profissional (cancelado e falta liberam o horário).
  constraint appointments_no_overlap
    exclude using gist (barber_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status not in ('cancelado', 'faltou'))
);

create index appointments_unit_starts_idx on public.appointments (unit_id, starts_at);
create index appointments_customer_idx on public.appointments (customer_id) where customer_id is not null;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- Assina o agendamento com a sessão de quem está gravando (ignora o que o cliente enviar).
-- Sem sessão (service_role, scripts) mantém o que veio.
create or replace function public.appointments_set_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null then
    new.created_by := v_uid;
    select coalesce(nullif(btrim(p.full_name), ''), p.email)
      into new.created_by_name
      from public.profiles p
      where p.id = v_uid;
  end if;
  return new;
end;
$$;

create trigger appointments_set_author
  before insert on public.appointments
  for each row execute function public.appointments_set_author();

-- ---------- Serviços do agendamento -----------------------------------------------
create table public.appointment_services (
  appointment_id   uuid not null,
  unit_id          uuid not null,
  position         smallint not null check (position >= 0),
  service_id       uuid not null,
  -- Foto do serviço na hora da marcação.
  name             text not null check (length(btrim(name)) between 1 and 80),
  duration_minutes integer not null check (duration_minutes between 1 and 480),
  price_cents      integer not null check (price_cents between 0 and 10000000),
  primary key (appointment_id, position),
  -- O serviço precisa ser da mesma unidade do agendamento.
  constraint appointment_services_appointment_fk
    foreign key (appointment_id, unit_id) references public.appointments (id, unit_id) on delete cascade,
  constraint appointment_services_service_fk
    foreign key (service_id, unit_id) references public.services (id, unit_id)
);

create index appointment_services_service_idx on public.appointment_services (service_id);

-- ---------- RLS ---------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.appointment_services enable row level security;

-- Admin e recepção da unidade veem tudo; o barbeiro vê só os próprios horários.
create policy appointments_select on public.appointments
  for select to authenticated
  using (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
    or (
      public.is_unit_member(unit_id)
      and exists (
        select 1 from public.barbers b
        where b.id = appointments.barber_id and b.user_id = (select auth.uid())
      )
    )
  );

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

create policy appointments_update on public.appointments
  for update to authenticated
  using (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  )
  with check (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

-- Só bloqueios podem ser apagados; agendamento é cancelado (o histórico fica).
create policy appointments_delete on public.appointments
  for delete to authenticated
  using (
    kind = 'block'
    and (
      public.is_network_admin()
      or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
    )
  );

-- Os serviços seguem a visibilidade do agendamento.
create policy appointment_services_select on public.appointment_services
  for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_services.appointment_id));

create policy appointment_services_insert on public.appointment_services
  for insert to authenticated
  with check (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

create policy appointment_services_delete on public.appointment_services
  for delete to authenticated
  using (
    public.is_network_admin()
    or public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
  );

-- ---------- Privilégios -------------------------------------------------------
revoke all on public.appointments, public.appointment_services from anon, authenticated;
grant select on public.appointments to authenticated;
grant insert (
  unit_id, barber_id, kind, customer_id, customer_name, customer_phone, starts_at, ends_at, status, notes
) on public.appointments to authenticated;
-- unit_id, kind, autor e criação nunca mudam.
grant update (
  barber_id, customer_id, customer_name, customer_phone, starts_at, ends_at, status, notes
) on public.appointments to authenticated;
grant delete on public.appointments to authenticated;
grant select, insert, delete on public.appointment_services to authenticated;
grant all on public.appointments, public.appointment_services to service_role;

-- ---------- Salvar agendamento + serviços de uma vez (atômico) ----------------------
-- SECURITY INVOKER: roda com os direitos de quem chamou, então a RLS e os privilégios
-- por coluna valem normalmente. Se o horário estiver ocupado a constraint de exclusão
-- barra e NADA é gravado (nem os serviços). `p_id` nulo cria; preenchido atualiza.
create or replace function public.save_appointment(p_id uuid, p_data jsonb, p_services jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_unit uuid;
begin
  if jsonb_typeof(p_services) is distinct from 'array' or jsonb_array_length(p_services) not between 1 and 8 then
    raise exception 'Informe de 1 a 8 serviços.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.appointments (
      unit_id, barber_id, kind, customer_id, customer_name, customer_phone, starts_at, ends_at, status, notes
    ) values (
      (p_data ->> 'unit_id')::uuid,
      (p_data ->> 'barber_id')::uuid,
      'appointment',
      nullif(p_data ->> 'customer_id', '')::uuid,
      p_data ->> 'customer_name',
      nullif(p_data ->> 'customer_phone', ''),
      (p_data ->> 'starts_at')::timestamptz,
      (p_data ->> 'ends_at')::timestamptz,
      coalesce(nullif(p_data ->> 'status', ''), 'agendado'),
      nullif(p_data ->> 'notes', '')
    )
    returning id, unit_id into v_id, v_unit;
  else
    update public.appointments set
      barber_id      = (p_data ->> 'barber_id')::uuid,
      customer_id    = nullif(p_data ->> 'customer_id', '')::uuid,
      customer_name  = p_data ->> 'customer_name',
      customer_phone = nullif(p_data ->> 'customer_phone', ''),
      starts_at      = (p_data ->> 'starts_at')::timestamptz,
      ends_at        = (p_data ->> 'ends_at')::timestamptz,
      notes          = nullif(p_data ->> 'notes', '')
    where id = v_id and kind = 'appointment'
    returning unit_id into v_unit;
    if not found then
      raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
    end if;
    delete from public.appointment_services where appointment_id = v_id;
  end if;

  insert into public.appointment_services (
    appointment_id, unit_id, position, service_id, name, duration_minutes, price_cents
  )
  select
    v_id,
    v_unit,
    (e.idx - 1)::smallint,
    (e.elem ->> 'service_id')::uuid,
    e.elem ->> 'name',
    (e.elem ->> 'duration_minutes')::integer,
    (e.elem ->> 'price_cents')::integer
  from jsonb_array_elements(p_services) with ordinality as e(elem, idx);

  return v_id;
end;
$$;

revoke all on function public.save_appointment(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_appointment(uuid, jsonb, jsonb) to authenticated, service_role;
