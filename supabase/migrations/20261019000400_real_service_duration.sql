-- Fim do agendamento = soma real das durações dos serviços (sem arredondar ao passo).
update public.appointments a
set ends_at = a.starts_at + make_interval(mins => greatest(1, coalesce((
  select sum(s.duration_minutes)::integer
  from public.appointment_services s
  where s.appointment_id = a.id
), 1)))
where a.kind = 'appointment';
