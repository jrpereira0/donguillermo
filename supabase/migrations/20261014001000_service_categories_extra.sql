-- Acrescenta as categorias "tratamento" e "outros" à lista de categorias de serviço.

alter table public.services drop constraint if exists services_category_check;

alter table public.services
  add constraint services_category_check
  check (category in (
    'cabelo', 'barba', 'combo', 'quimica', 'sobrancelha', 'unha', 'nariz', 'orelha', 'massagem',
    'tratamento', 'outros'
  ));
