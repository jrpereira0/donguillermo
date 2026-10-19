const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TZ = "America/Sao_Paulo";

export function spDay(offset = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + offset * 86_400_000));
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type CommissionPeriod = {
  de: string;
  ate: string;
  /** Início do dia `de` em São Paulo (ISO com fuso). */
  fromISO: string;
  /** Dia seguinte ao `ate` (limite exclusivo). */
  toISO: string;
  today: string;
};

/** Período das comissões: padrão = mês atual até hoje. Aceita ?de=&ate= (yyyy-mm-dd). */
export function resolvePeriod(sp: { de?: string; ate?: string }): CommissionPeriod {
  const today = spDay();
  const monthStart = `${today.slice(0, 8)}01`;
  let de = sp.de && DATE_RE.test(sp.de) ? sp.de : monthStart;
  let ate = sp.ate && DATE_RE.test(sp.ate) ? sp.ate : today;
  if (de > ate) [de, ate] = [ate, de];
  // No máximo 1 ano por consulta (proteção de leitura).
  if (addDaysIso(de, 366) < ate) de = addDaysIso(ate, -366);
  if (de < "2024-01-01") de = "2024-01-01";
  return {
    de,
    ate,
    fromISO: `${de}T00:00:00-03:00`,
    toISO: `${addDaysIso(ate, 1)}T00:00:00-03:00`,
    today,
  };
}

export const periodLabel = (de: string, ate: string) => {
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: TZ });
  const a = fmt.format(new Date(`${de}T12:00:00`));
  const b = fmt.format(new Date(`${ate}T12:00:00`));
  return de === ate ? a : `${a} – ${b}`;
};
