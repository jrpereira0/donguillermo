/**
 * Cores bem distintas por situação — grade, legenda, menu e modal.
 * Agendado = ouro · Confirmado = azul · Em atendimento = âmbar · Concluído = verde · Cancelado = rose.
 */

export function statusCardClass(status: string): string {
  switch (status) {
    case "confirmado":
      return "border border-sky-400/25 bg-[#152033] hover:bg-[#1a2740]";
    case "em_atendimento":
      return "border border-amber-400/40 bg-[#3a2a10] shadow-[0_0_18px_rgb(245_158_11/0.28)] hover:bg-[#452f12]";
    case "concluido":
      return "border border-emerald-400/25 bg-[#10241a] hover:bg-[#153024]";
    case "cancelado":
    case "faltou":
      return "border border-dashed border-rose-400/30 bg-[#1a1416] text-muted-foreground";
    default:
      // agendado
      return "border border-gold/20 bg-[#221e16] hover:bg-[#2a251a]";
  }
}

export function statusRailClass(status: string): string {
  switch (status) {
    case "confirmado":
      return "bg-sky-400";
    case "em_atendimento":
      return "bg-amber-400";
    case "concluido":
      return "bg-emerald-400";
    case "cancelado":
    case "faltou":
      return "bg-rose-400/70";
    default:
      return "bg-[#c0a062]";
  }
}

/** Chip / badge no modal de detalhe. */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case "confirmado":
      return "border-sky-400/45 bg-sky-400/15 text-sky-300";
    case "em_atendimento":
      return "border-amber-400/55 bg-amber-400/20 text-amber-200";
    case "concluido":
      return "border-emerald-400/45 bg-emerald-400/15 text-emerald-300";
    case "cancelado":
    case "faltou":
      return "border-rose-400/35 bg-rose-400/10 text-rose-300/90";
    default:
      return "border-gold/40 bg-gold/10 text-gold";
  }
}
