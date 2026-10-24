-- Permissões que faltaram nas mudanças recentes:
-- - packages ganhou price_mode/fixed_price_cents (033), mas o grant de
--   insert/update é por coluna (020) — salvar pacote quebrava com 42501.
-- - commission_brackets (027) e commission_settings (032) têm RLS, mas sem
--   grant de tabela o PostgREST nem chega na policy: leitura/escrita do
--   painel do admin e da área de Comissões falhariam do mesmo jeito.
-- A RLS continua decidindo quem pode (escrita nas de comissão: só admin da rede).

grant insert (unit_id, name, description, discount_pct, price_mode, fixed_price_cents, validity_days, is_active)
  on public.packages to authenticated;
grant update (name, description, discount_pct, price_mode, fixed_price_cents, validity_days, is_active)
  on public.packages to authenticated;

grant select, insert, update, delete on public.commission_brackets to authenticated;
grant select, insert, update on public.commission_settings to authenticated;
grant all on public.commission_brackets, public.commission_settings to service_role;
