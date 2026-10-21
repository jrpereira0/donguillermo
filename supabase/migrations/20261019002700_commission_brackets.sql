-- Comissão progressiva de serviços (contrato salão-parceiro): o percentual é
-- o da faixa do faturamento MENSAL de serviços do profissional, aplicado
-- sobre todo o faturamento do mês. Tabela única da rede, editável pelo admin
-- (valores iniciais = tabela de 2026 do contrato). Produtos não entram aqui:
-- seguem com o percentual próprio de cada profissional.

create table public.commission_brackets (
  id uuid primary key default gen_random_uuid(),
  min_cents integer not null check (min_cents >= 0),
  max_cents integer check (max_cents is null or max_cents >= min_cents),
  pct numeric(5, 2) not null check (pct >= 0 and pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index commission_brackets_min_idx on public.commission_brackets (min_cents);

insert into public.commission_brackets (min_cents, max_cents, pct) values
  (100, 1073873, 25),
  (1073874, 1208107, 26),
  (1208108, 1342341, 27),
  (1342342, 1476575, 28),
  (1476576, 1610809, 29),
  (1610810, 1879279, 30),
  (1879280, 2147746, 31),
  (2147747, 2416215, 32),
  (2416216, 2684682, 33),
  (2684683, 2953050, 33.5),
  (2953051, 3221418, 34),
  (3221419, 3489786, 34.5),
  (3489787, null, 35);

alter table public.commission_brackets enable row level security;

-- Leitura: qualquer usuário logado (a área de Comissões das unidades lê).
create policy commission_brackets_select on public.commission_brackets
  for select to authenticated using (true);

-- Escrita: só o admin da rede.
create policy commission_brackets_write on public.commission_brackets
  for all to authenticated
  using (public.is_network_admin())
  with check (public.is_network_admin());
