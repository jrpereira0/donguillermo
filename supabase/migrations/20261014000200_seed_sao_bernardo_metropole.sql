-- Unidade piloto. Endereço, telefone e horário serão preenchidos depois
-- pelo painel admin (Etapa 5) quando os dados forem informados.
insert into public.units (slug, name)
values ('sao-bernardo-metropole', 'São Bernardo - Shopping Metrópole')
on conflict (slug) do nothing;
