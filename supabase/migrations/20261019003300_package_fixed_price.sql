-- Preço do pacote de duas formas, à escolha de quem cadastra:
-- 'desconto' = percentual sobre a soma dos serviços (como era);
-- 'fixo' = valor fechado em reais, independente da soma.
-- O preço de venda vigente continua derivado: fixo usa fixed_price_cents;
-- desconto usa discount_pct. Quem já comprou guarda a foto da venda
-- (customer_packages), então mudar o catálogo não mexe nos vendidos.

alter table public.packages
  add column price_mode text not null default 'desconto'
    check (price_mode in ('desconto', 'fixo')),
  add column fixed_price_cents integer
    check (fixed_price_cents is null or fixed_price_cents >= 0);
