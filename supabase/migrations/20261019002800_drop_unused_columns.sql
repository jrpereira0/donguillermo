-- Colunas que o sistema não lê nem grava, e que estão vazias:
-- `customers.preferred_barber_id` (a preferência de profissional não existe
-- em nenhuma tela) e `profiles.phone` (o telefone mora no profissional, no
-- cliente ou na unidade — o perfil de login não tem esse campo).

alter table public.customers drop column if exists preferred_barber_id;
alter table public.profiles drop column if exists phone;
