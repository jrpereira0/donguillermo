-- =============================================================================
-- Profissionais: CPF vira CNPJ; telefone passa a guardar só dígitos
-- =============================================================================
-- CNPJ: 14 caracteres, maiúsculos, sem máscara. Desde julho/2026 as 12 primeiras
-- posições podem ter letras (CNPJ alfanumérico); as 2 últimas são numéricas.
-- A validação dos dígitos verificadores fica na aplicação (Zod); o banco garante o formato.
--
-- Telefone: DDD + número (10 ou 11 dígitos), sem máscara.
--
-- Os CPFs já gravados não servem como CNPJ e são descartados (a tela de cadastro
-- ainda estava em desenvolvimento). Telefones antigos são normalizados; os que não
-- forem um número brasileiro válido ficam vazios.
-- =============================================================================

-- ---------- CPF -> CNPJ -------------------------------------------------------
alter table public.barbers drop constraint if exists barbers_cpf_check;
update public.barbers set cpf = null where cpf is not null;

alter table public.barbers rename column cpf to cnpj;
alter index public.barbers_unit_cpf_unique rename to barbers_unit_cnpj_unique;

alter table public.barbers
  add constraint barbers_cnpj_check
  check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');

-- ---------- Telefone ----------------------------------------------------------
update public.barbers
set phone = case
  when regexp_replace(phone, '\D', '', 'g') ~ '^55[1-9][1-9][0-9]{8,9}$'
    then substr(regexp_replace(phone, '\D', '', 'g'), 3)
  when regexp_replace(phone, '\D', '', 'g') ~ '^[1-9][1-9][0-9]{8,9}$'
    then regexp_replace(phone, '\D', '', 'g')
  else null
end
where phone is not null;

alter table public.barbers drop constraint if exists barbers_phone_check;
alter table public.barbers
  add constraint barbers_phone_check
  check (phone is null or phone ~ '^[1-9][1-9][0-9]{8,9}$');

-- Privilégios por coluna acompanham a coluna renomeada (o Postgres mantém os grants).
