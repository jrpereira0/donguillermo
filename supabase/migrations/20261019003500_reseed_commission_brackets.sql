-- Restaura a tabela de faixas de comissão de serviços (contrato 2026) quando
-- ela está vazia — sem tabela, a comissão de serviços calcula 0 para todos.
-- Só insere se a tabela estiver vazia: nunca sobrescreve ajuste do admin.

insert into public.commission_brackets (min_cents, max_cents, pct)
select v.min_cents, v.max_cents, v.pct
from (
  values
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
    (3489787, null, 35)
) as v(min_cents, max_cents, pct)
where not exists (select 1 from public.commission_brackets);
