-- =============================================================================
-- Profissionais: nome/sobrenome separados e endereço (CEP)
-- =============================================================================
-- `full_name` continua existindo (nome + sobrenome montados pela aplicação) para
-- listas e relatórios; `first_name`/`last_name` alimentam o formulário.
-- Endereço (LGPD): só admin, recepção da unidade e o próprio barbeiro leem (mesma
-- RLS da tabela); só admin/recepção da unidade alteram (grant de colunas abaixo).
-- Aditiva: nenhuma coluna existente muda.
-- =============================================================================

alter table public.barbers
  add column first_name    text check (first_name is null or length(btrim(first_name)) between 2 and 60),
  add column last_name     text check (last_name is null or length(btrim(last_name)) between 2 and 60),
  add column cep           text check (cep is null or cep ~ '^[0-9]{8}$'),
  add column street        text check (street is null or length(street) <= 120),
  add column street_number text check (street_number is null or length(street_number) <= 20),
  add column complement    text check (complement is null or length(complement) <= 60),
  add column neighborhood  text check (neighborhood is null or length(neighborhood) <= 80),
  add column city          text check (city is null or length(city) <= 80),
  add column state         text check (state is null or state ~ '^[A-Z]{2}$');

-- Linhas já existentes: divide o nome completo no primeiro espaço.
update public.barbers
set first_name = case when length(btrim(split_part(btrim(full_name), ' ', 1))) >= 2
                      then split_part(btrim(full_name), ' ', 1) end,
    last_name  = case when length(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1))) >= 2
                      then btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)) end
where first_name is null and last_name is null;

grant update (
  first_name, last_name, cep, street, street_number, complement, neighborhood, city, state
) on public.barbers to authenticated;
