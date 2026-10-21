-- =============================================================================
-- Telefone de cliente também é único na rede
-- =============================================================================
-- O cliente é DA REDE (cadastro único): o mesmo telefone não pode aparecer em
-- dois cadastros, senão a recepção cria a pessoa de novo em vez de achar o
-- cadastro existente (pacotes, histórico e comissões se partem no meio).
-- O telefone já é gravado normalizado (só dígitos, sem DDI), então a igualdade
-- é exata. Mesmo desenho do CPF: índice único parcial (telefone é opcional no
-- banco para o autocadastro enxuto). O índice único também serve às buscas por
-- telefone, então o índice comum antigo sai.
-- =============================================================================

create unique index customers_phone_unique on public.customers (phone) where phone is not null;
drop index public.customers_phone_idx;
