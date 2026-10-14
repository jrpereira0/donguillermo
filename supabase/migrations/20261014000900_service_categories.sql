-- Novas categorias de serviço: cabelo, barba, combo, quimica, sobrancelha, unha, nariz, orelha, massagem.
-- "tratamento" passa a ser "quimica"; "outros" vai para "cabelo" (categoria padrão).

alter table public.services drop constraint if exists services_category_check;

update public.services set category = 'quimica' where category = 'tratamento';
update public.services set category = 'cabelo' where category = 'outros';

alter table public.services
  add constraint services_category_check
  check (category in ('cabelo', 'barba', 'combo', 'quimica', 'sobrancelha', 'unha', 'nariz', 'orelha', 'massagem'));
