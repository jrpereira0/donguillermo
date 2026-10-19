-- Comandas (histórico do cliente) e caixa da unidade.
-- Uma unidade tem no máximo um caixa aberto. Cobrança é atômica (itens + pagamentos + fechar).
-- Recepção da unidade grava; qualquer recepção da rede lê comandas fechadas (histórico do cliente).

-- ---------- Caixa -------------------------------------------------------------
create table public.cash_registers (
  id                  uuid primary key default gen_random_uuid(),
  unit_id             uuid not null references public.units (id) on delete cascade,
  status              text not null default 'aberto' check (status in ('aberto', 'fechado')),
  business_date       date not null,
  opening_cents       integer not null check (opening_cents between 0 and 100000000),
  expected_cash_cents integer check (expected_cash_cents is null or expected_cash_cents between -100000000 and 100000000),
  counted_cash_cents  integer check (counted_cash_cents is null or counted_cash_cents between 0 and 100000000),
  notes               text check (notes is null or length(notes) <= 500),
  opened_at           timestamptz not null default now(),
  closed_at           timestamptz,
  opened_by           uuid references auth.users (id) on delete set null,
  opened_by_name      text,
  closed_by           uuid references auth.users (id) on delete set null,
  closed_by_name      text,
  constraint cash_registers_closed_check check (
    (status = 'aberto' and closed_at is null and counted_cash_cents is null)
    or (status = 'fechado' and closed_at is not null and counted_cash_cents is not null and expected_cash_cents is not null)
  )
);

create unique index cash_registers_one_open_idx
  on public.cash_registers (unit_id) where status = 'aberto';
create index cash_registers_unit_opened_idx on public.cash_registers (unit_id, opened_at desc);

-- FK composta (comanda e movimento carregam a unidade junto).
alter table public.cash_registers
  add constraint cash_registers_id_unit_unique unique (id, unit_id);

-- Sangria (saída) e suprimento (entrada) de dinheiro do caixa aberto.
create table public.cash_movements (
  id             uuid primary key default gen_random_uuid(),
  register_id    uuid not null references public.cash_registers (id) on delete cascade,
  unit_id        uuid not null,
  kind           text not null check (kind in ('sangria', 'suprimento')),
  amount_cents   integer not null check (amount_cents between 1 and 100000000),
  note           text check (note is null or length(note) <= 200),
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  created_by_name text,
  constraint cash_movements_register_fk
    foreign key (register_id, unit_id) references public.cash_registers (id, unit_id) on delete cascade
);

create index cash_movements_register_idx on public.cash_movements (register_id);

-- ---------- Comanda -----------------------------------------------------------
create table public.tickets (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units (id) on delete cascade,
  register_id     uuid,
  appointment_id  uuid,
  customer_id     uuid references public.customers (id) on delete set null,
  customer_name   text not null check (length(btrim(customer_name)) between 2 and 120),
  barber_id       uuid,
  barber_name     text,
  status          text not null default 'aberta' check (status in ('aberta', 'fechada', 'cancelada')),
  discount_cents  integer not null default 0 check (discount_cents between 0 and 100000000),
  notes           text check (notes is null or length(notes) <= 500),
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  opened_by       uuid references auth.users (id) on delete set null,
  opened_by_name  text,
  closed_by       uuid references auth.users (id) on delete set null,
  closed_by_name  text,
  constraint tickets_id_unit_unique unique (id, unit_id),
  constraint tickets_register_fk
    foreign key (register_id, unit_id) references public.cash_registers (id, unit_id),
  constraint tickets_appointment_fk
    foreign key (appointment_id, unit_id) references public.appointments (id, unit_id) on delete set null,
  constraint tickets_barber_fk
    foreign key (barber_id, unit_id) references public.barbers (id, unit_id) on delete set null,
  constraint tickets_closed_check check (
    (status = 'aberta' and closed_at is null and register_id is null)
    or (status = 'fechada' and closed_at is not null and register_id is not null)
    or (status = 'cancelada' and register_id is null)
  )
);

create unique index tickets_one_live_appointment_idx
  on public.tickets (appointment_id)
  where appointment_id is not null and status <> 'cancelada';
create index tickets_unit_opened_idx on public.tickets (unit_id, opened_at desc);
create index tickets_unit_open_idx on public.tickets (unit_id) where status = 'aberta';
create index tickets_customer_opened_idx on public.tickets (customer_id, opened_at desc) where customer_id is not null;
create index tickets_register_idx on public.tickets (register_id) where register_id is not null;

create table public.ticket_items (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null,
  unit_id          uuid not null,
  position         smallint not null check (position >= 0),
  service_id       uuid,
  name             text not null check (length(btrim(name)) between 1 and 80),
  quantity         smallint not null check (quantity between 1 and 20),
  unit_price_cents integer not null check (unit_price_cents between 0 and 10000000),
  constraint ticket_items_ticket_fk
    foreign key (ticket_id, unit_id) references public.tickets (id, unit_id) on delete cascade,
  constraint ticket_items_service_fk
    foreign key (service_id, unit_id) references public.services (id, unit_id),
  constraint ticket_items_position_unique unique (ticket_id, position)
);

create index ticket_items_ticket_idx on public.ticket_items (ticket_id);

create table public.ticket_payments (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null,
  unit_id      uuid not null,
  register_id  uuid not null,
  method       text not null check (method in ('dinheiro', 'pix', 'debito', 'credito')),
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  created_at   timestamptz not null default now(),
  constraint ticket_payments_ticket_fk
    foreign key (ticket_id, unit_id) references public.tickets (id, unit_id) on delete cascade,
  constraint ticket_payments_register_fk
    foreign key (register_id, unit_id) references public.cash_registers (id, unit_id)
);

create index ticket_payments_register_idx on public.ticket_payments (register_id);
create index ticket_payments_ticket_idx on public.ticket_payments (ticket_id);

-- ---------- Autor -------------------------------------------------------------
create or replace function public.tickets_set_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
begin
  if v_uid is not null then
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_name
      from public.profiles p where p.id = v_uid;
    new.opened_by := v_uid;
    new.opened_by_name := v_name;
  end if;
  return new;
end;
$$;

create trigger tickets_set_author
  before insert on public.tickets
  for each row execute function public.tickets_set_author();

create or replace function public.registers_set_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
begin
  if v_uid is not null and tg_op = 'INSERT' then
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_name
      from public.profiles p where p.id = v_uid;
    new.opened_by := v_uid;
    new.opened_by_name := v_name;
  end if;
  return new;
end;
$$;

create trigger registers_set_author
  before insert on public.cash_registers
  for each row execute function public.registers_set_author();

create or replace function public.cash_movements_set_author()
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
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into new.created_by_name
      from public.profiles p where p.id = v_uid;
  end if;
  return new;
end;
$$;

create trigger cash_movements_set_author
  before insert on public.cash_movements
  for each row execute function public.cash_movements_set_author();

-- ---------- Abrir comanda a partir do agendamento -----------------------------
create or replace function public.open_ticket_from_appointment(p_appointment uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_id uuid;
  v_barber_name text;
begin
  select * into v_appt from public.appointments
    where id = p_appointment and kind = 'appointment';
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_appt.status in ('cancelado', 'faltou') then
    raise exception 'Este agendamento não pode ser cobrado.' using errcode = '22023';
  end if;

  select t.id into v_id from public.tickets t
    where t.appointment_id = p_appointment and t.status <> 'cancelada'
    limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select b.display_name into v_barber_name from public.barbers b where b.id = v_appt.barber_id;

  insert into public.tickets (
    unit_id, appointment_id, customer_id, customer_name, barber_id, barber_name, notes
  ) values (
    v_appt.unit_id,
    v_appt.id,
    v_appt.customer_id,
    v_appt.customer_name,
    v_appt.barber_id,
    v_barber_name,
    v_appt.notes
  )
  returning id into v_id;

  insert into public.ticket_items (ticket_id, unit_id, position, service_id, name, quantity, unit_price_cents)
  select v_id, v_appt.unit_id, s.position, s.service_id, s.name, 1, s.price_cents
  from public.appointment_services s
  where s.appointment_id = v_appt.id
  order by s.position;

  return v_id;
end;
$$;

-- ---------- Salvar comanda ainda aberta (rascunho) --------------------------------
create or replace function public.save_open_ticket(
  p_id uuid,
  p_discount integer,
  p_notes text,
  p_barber uuid,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_barber_name text;
begin
  if p_discount is null or p_discount < 0 then
    raise exception 'Desconto inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 30 then
    raise exception 'No máximo 30 itens.' using errcode = '22023';
  end if;

  select * into v_ticket from public.tickets where id = p_id for update;
  if not found then
    raise exception 'Comanda não encontrada.' using errcode = 'P0002';
  end if;
  if v_ticket.status <> 'aberta' then
    raise exception 'Esta comanda já foi encerrada.' using errcode = '22023';
  end if;

  if p_barber is not null then
    select display_name into v_barber_name from public.barbers
      where id = p_barber and unit_id = v_ticket.unit_id;
    if v_barber_name is null then
      raise exception 'Profissional não encontrado.' using errcode = '22023';
    end if;
  end if;

  delete from public.ticket_items where ticket_id = v_ticket.id;

  if jsonb_array_length(p_items) > 0 then
    insert into public.ticket_items (ticket_id, unit_id, position, service_id, name, quantity, unit_price_cents)
    select
      v_ticket.id,
      v_ticket.unit_id,
      (e.idx - 1)::smallint,
      nullif(e.elem ->> 'service_id', '')::uuid,
      e.elem ->> 'name',
      (e.elem ->> 'quantity')::smallint,
      (e.elem ->> 'unit_price_cents')::integer
    from jsonb_array_elements(p_items) with ordinality as e(elem, idx);
  end if;

  update public.tickets set
    discount_cents = p_discount,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    barber_id = p_barber,
    barber_name = v_barber_name
  where id = v_ticket.id;
end;
$$;

-- ---------- Cobrar (fecha a comanda no caixa aberto) --------------------------
create or replace function public.charge_ticket(p_id uuid, p_discount integer, p_items jsonb, p_payments jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_register uuid;
  v_subtotal integer := 0;
  v_total integer;
  v_paid integer := 0;
  v_uid uuid := (select auth.uid());
  v_name text;
begin
  if p_discount is null or p_discount < 0 then
    raise exception 'Desconto inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'A comanda precisa de 1 a 30 itens.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) > 6 then
    raise exception 'No máximo 6 pagamentos.' using errcode = '22023';
  end if;

  select * into v_ticket from public.tickets where id = p_id for update;
  if not found then
    raise exception 'Comanda não encontrada.' using errcode = 'P0002';
  end if;
  if v_ticket.status <> 'aberta' then
    raise exception 'Esta comanda já foi encerrada.' using errcode = '22023';
  end if;

  select r.id into v_register from public.cash_registers r
    where r.unit_id = v_ticket.unit_id and r.status = 'aberto'
    limit 1;
  if v_register is null then
    raise exception 'Abra o caixa antes de cobrar.' using errcode = 'P0001';
  end if;

  delete from public.ticket_items where ticket_id = v_ticket.id;

  insert into public.ticket_items (ticket_id, unit_id, position, service_id, name, quantity, unit_price_cents)
  select
    v_ticket.id,
    v_ticket.unit_id,
    (e.idx - 1)::smallint,
    nullif(e.elem ->> 'service_id', '')::uuid,
    e.elem ->> 'name',
    (e.elem ->> 'quantity')::smallint,
    (e.elem ->> 'unit_price_cents')::integer
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx);

  select coalesce(sum(quantity * unit_price_cents), 0) into v_subtotal
    from public.ticket_items where ticket_id = v_ticket.id;
  if p_discount > v_subtotal then
    raise exception 'O desconto não pode passar do subtotal.' using errcode = '22023';
  end if;
  v_total := v_subtotal - p_discount;

  select coalesce(sum((e.elem ->> 'amount_cents')::integer), 0) into v_paid
    from jsonb_array_elements(p_payments) as e(elem);
  if v_total = 0 then
    if v_paid <> 0 then
      raise exception 'Comanda zerada não leva pagamento.' using errcode = '22023';
    end if;
  elsif jsonb_array_length(p_payments) < 1 or v_paid <> v_total then
    raise exception 'A soma dos pagamentos precisa fechar o total.' using errcode = '22023';
  end if;

  if v_total > 0 then
    insert into public.ticket_payments (ticket_id, unit_id, register_id, method, amount_cents)
    select
      v_ticket.id,
      v_ticket.unit_id,
      v_register,
      e.elem ->> 'method',
      (e.elem ->> 'amount_cents')::integer
    from jsonb_array_elements(p_payments) as e(elem);
  end if;

  if v_uid is not null then
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_name
      from public.profiles p where p.id = v_uid;
  end if;

  update public.tickets set
    status = 'fechada',
    discount_cents = p_discount,
    register_id = v_register,
    closed_at = now(),
    closed_by = v_uid,
    closed_by_name = v_name
  where id = v_ticket.id;

  -- Atendimento cobrado conta como concluído.
  if v_ticket.appointment_id is not null then
    update public.appointments set status = 'concluido'
      where id = v_ticket.appointment_id
        and status in ('agendado', 'confirmado', 'em_atendimento');
  end if;

  return v_ticket.id;
end;
$$;

-- ---------- Fechar o caixa ----------------------------------------------------
create or replace function public.close_cash_register(p_id uuid, p_counted integer, p_notes text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reg public.cash_registers%rowtype;
  v_open integer;
  v_in integer;
  v_out integer;
  v_cash integer;
  v_expected integer;
  v_uid uuid := (select auth.uid());
  v_name text;
begin
  if p_counted is null or p_counted < 0 then
    raise exception 'Informe o dinheiro contado.' using errcode = '22023';
  end if;

  select * into v_reg from public.cash_registers where id = p_id for update;
  if not found or v_reg.status <> 'aberto' then
    raise exception 'Caixa não encontrado ou já fechado.' using errcode = 'P0002';
  end if;

  select count(*) into v_open from public.tickets
    where unit_id = v_reg.unit_id and status = 'aberta';
  if v_open > 0 then
    raise exception 'Feche ou cancele as comandas abertas antes de fechar o caixa.' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_cents) filter (where kind = 'suprimento'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'sangria'), 0)
    into v_in, v_out
    from public.cash_movements where register_id = v_reg.id;

  select coalesce(sum(amount_cents), 0) into v_cash
    from public.ticket_payments
    where register_id = v_reg.id and method = 'dinheiro';

  v_expected := v_reg.opening_cents + v_in - v_out + v_cash;

  if v_uid is not null then
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_name
      from public.profiles p where p.id = v_uid;
  end if;

  update public.cash_registers set
    status = 'fechado',
    closed_at = now(),
    counted_cash_cents = p_counted,
    expected_cash_cents = v_expected,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    closed_by = v_uid,
    closed_by_name = v_name
  where id = v_reg.id;
end;
$$;

-- ---------- RLS ---------------------------------------------------------------
alter table public.cash_registers enable row level security;
alter table public.cash_movements enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_items enable row level security;
alter table public.ticket_payments enable row level security;

-- Caixa: só a recepção da unidade (e admin).
create policy cash_registers_all on public.cash_registers
  for all to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]))
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

create policy cash_movements_all on public.cash_movements
  for all to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]))
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

-- Comandas: a rede lê (histórico do cliente); só a unidade grava.
create policy tickets_select on public.tickets
  for select to authenticated
  using (public.is_network_admin() or public.is_any_reception());

create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

create policy tickets_update on public.tickets
  for update to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]))
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

create policy ticket_items_select on public.ticket_items
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_items.ticket_id));

create policy ticket_items_write on public.ticket_items
  for all to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]))
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

create policy ticket_payments_select on public.ticket_payments
  for select to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

create policy ticket_payments_insert on public.ticket_payments
  for insert to authenticated
  with check (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

-- ---------- Privilégios -------------------------------------------------------
revoke all on public.cash_registers, public.cash_movements, public.tickets, public.ticket_items, public.ticket_payments
  from anon, authenticated;

grant select, insert, update on public.cash_registers to authenticated;
grant select, insert on public.cash_movements to authenticated;
grant select, insert, update on public.tickets to authenticated;
grant select, insert, update, delete on public.ticket_items to authenticated;
grant select, insert on public.ticket_payments to authenticated;

grant all on public.cash_registers, public.cash_movements, public.tickets, public.ticket_items, public.ticket_payments
  to service_role;

revoke all on function public.open_ticket_from_appointment(uuid) from public, anon;
revoke all on function public.save_open_ticket(uuid, integer, text, uuid, jsonb) from public, anon;
revoke all on function public.charge_ticket(uuid, integer, jsonb, jsonb) from public, anon;
revoke all on function public.close_cash_register(uuid, integer, text) from public, anon;
grant execute on function public.open_ticket_from_appointment(uuid) to authenticated, service_role;
grant execute on function public.save_open_ticket(uuid, integer, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.charge_ticket(uuid, integer, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.close_cash_register(uuid, integer, text) to authenticated, service_role;
