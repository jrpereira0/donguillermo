-- Trilha de alterações do caixa: abertura, fechamento e reabertura, com autor e valores.
-- Registrada por trigger (qualquer caminho que abra/feche/reabra entra), exibida no histórico.

create table public.cash_register_events (
  id          uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.cash_registers (id) on delete cascade,
  unit_id     uuid not null,
  kind        text not null check (kind in ('abertura', 'fechamento', 'reabertura')),
  actor_name  text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint cash_register_events_register_fk
    foreign key (register_id, unit_id) references public.cash_registers (id, unit_id) on delete cascade
);

create index cash_register_events_register_idx on public.cash_register_events (register_id, created_at desc);

alter table public.cash_register_events enable row level security;

create policy cash_register_events_select on public.cash_register_events
  for select to authenticated
  using (public.is_network_admin() or public.has_unit_role(unit_id, array['recepcao']::public.app_role[]));

revoke all on public.cash_register_events from anon, authenticated;
grant select on public.cash_register_events to authenticated;
grant all on public.cash_register_events to service_role;

create or replace function public.log_cash_register_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.status = 'aberto' then
      insert into public.cash_register_events (register_id, unit_id, kind, actor_name, meta)
      values (new.id, new.unit_id, 'abertura', new.opened_by_name,
              jsonb_build_object('openingCents', new.opening_cents, 'businessDate', new.business_date));
    end if;
    return new;
  end if;

  if old.status = 'aberto' and new.status = 'fechado' then
    insert into public.cash_register_events (register_id, unit_id, kind, actor_name, meta)
    values (new.id, new.unit_id, 'fechamento', new.closed_by_name,
            jsonb_build_object('countedCents', new.counted_cash_cents,
                               'expectedCents', new.expected_cash_cents,
                               'openingCents', new.opening_cents));
  elsif old.status = 'fechado' and new.status = 'aberto' then
    if v_uid is not null then
      select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_actor
      from public.profiles p where p.id = v_uid;
    end if;
    insert into public.cash_register_events (register_id, unit_id, kind, actor_name, meta)
    values (new.id, new.unit_id, 'reabertura', v_actor,
            jsonb_build_object('businessDate', new.business_date));
  end if;
  return new;
end;
$$;

create trigger cash_registers_log_event
  after insert or update of status on public.cash_registers
  for each row execute function public.log_cash_register_event();

-- Caixas que já existiam ganham a trilha retroativa (abertura e, se fechado, fechamento).
insert into public.cash_register_events (register_id, unit_id, kind, actor_name, meta, created_at)
select r.id, r.unit_id, 'abertura', r.opened_by_name,
       jsonb_build_object('openingCents', r.opening_cents, 'businessDate', r.business_date),
       r.opened_at
from public.cash_registers r;

insert into public.cash_register_events (register_id, unit_id, kind, actor_name, meta, created_at)
select r.id, r.unit_id, 'fechamento', r.closed_by_name,
       jsonb_build_object('countedCents', r.counted_cash_cents,
                          'expectedCents', r.expected_cash_cents,
                          'openingCents', r.opening_cents),
       r.closed_at
from public.cash_registers r
where r.status = 'fechado' and r.closed_at is not null;
