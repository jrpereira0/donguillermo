-- =============================================================================
-- Observações do cliente (lista)
-- =============================================================================
-- Cada cliente pode ter VÁRIAS observações, escritas pela recepção (de qualquer unidade)
-- e do admin da rede. Qualquer recepção pode editar ou excluir qualquer observação do
-- cliente (a ficha é da rede). Cada observação guarda quem escreveu e em qual unidade.
--
-- `created_by` e `author_name` NÃO vêm do cliente: um gatilho os preenche a partir da
-- sessão (auth.uid() + perfil), então ninguém consegue assinar uma observação como outra
-- pessoa. `customer_id`, `unit_id`, autor e data de criação nunca mudam.
--
-- Esta tabela substitui a coluna única `customers.notes` (as notas que existirem são
-- copiadas para a lista antes de a coluna ser removida).
-- =============================================================================

create table public.customer_notes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  -- Unidade onde a observação foi escrita (nula se a unidade for apagada).
  unit_id     uuid references public.units (id) on delete set null,
  body        text not null check (length(btrim(body)) between 1 and 1000),
  created_by  uuid references auth.users (id) on delete set null,
  -- Nome de quem escreveu, guardado na hora (continua legível se a conta for removida).
  author_name text check (author_name is null or length(author_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);

create trigger customer_notes_set_updated_at
  before update on public.customer_notes
  for each row execute function public.set_updated_at();

-- Assina a observação com a sessão de quem está gravando (ignora o que o cliente enviar).
-- Sem sessão (service_role, scripts) mantém o que veio.
create or replace function public.customer_notes_set_author()
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
      into new.author_name
      from public.profiles p
      where p.id = v_uid;
  end if;
  return new;
end;
$$;

create trigger customer_notes_set_author
  before insert on public.customer_notes
  for each row execute function public.customer_notes_set_author();

-- ---------- RLS ---------------------------------------------------------------
alter table public.customer_notes enable row level security;

create policy customer_notes_select on public.customer_notes
  for select to authenticated
  using (public.is_network_admin() or public.is_any_reception());

-- A unidade informada precisa ser uma onde o usuário é recepção (admin: qualquer uma).
create policy customer_notes_insert on public.customer_notes
  for insert to authenticated
  with check (
    public.is_network_admin()
    or (
      unit_id is not null
      and public.has_unit_role(unit_id, array['recepcao']::public.app_role[])
    )
  );

create policy customer_notes_update on public.customer_notes
  for update to authenticated
  using (public.is_network_admin() or public.is_any_reception())
  with check (public.is_network_admin() or public.is_any_reception());

create policy customer_notes_delete on public.customer_notes
  for delete to authenticated
  using (public.is_network_admin() or public.is_any_reception());

-- ---------- Privilégios -------------------------------------------------------
revoke all on public.customer_notes from anon, authenticated;
grant select on public.customer_notes to authenticated;
grant insert (customer_id, unit_id, body) on public.customer_notes to authenticated;
grant update (body) on public.customer_notes to authenticated;
grant delete on public.customer_notes to authenticated;
grant all on public.customer_notes to service_role;

-- ---------- Migra a coluna antiga ------------------------------------------------
insert into public.customer_notes (customer_id, unit_id, body)
select c.id, c.created_unit_id, btrim(c.notes)
from public.customers c
where c.notes is not null and btrim(c.notes) <> '';

alter table public.customers drop column notes;
