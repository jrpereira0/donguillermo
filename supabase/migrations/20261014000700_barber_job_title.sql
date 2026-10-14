-- =============================================================================
-- Profissionais: função (cargo) exibida no cadastro
-- =============================================================================
-- Informativa: NÃO muda permissões. O acesso ao sistema continua definido por
-- `unit_members.role` (todo profissional cadastrado por esta tela entra como
-- `barbeiro`). Linhas existentes ficam como 'barbeiro'.
-- =============================================================================

alter table public.barbers
  add column job_title text not null default 'barbeiro'
    check (job_title in ('barbeiro', 'recepcionista', 'gerente', 'lider', 'auxiliar'));

grant update (job_title) on public.barbers to authenticated;
