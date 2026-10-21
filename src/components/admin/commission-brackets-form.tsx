"use client";

import { useState, useTransition } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { saveCommissionBracketsAction } from "@/app/admin/comissoes/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { bracketFor, DEFAULT_BRACKETS_2026, type CommissionBracket } from "@/lib/commissions/brackets";
import { centsToInput, formatBRL, maskMoney, moneyToCents } from "@/lib/validation/service";
import { cn } from "@/lib/utils";

type Row = { min: string; max: string; pct: string };

const toRow = (b: CommissionBracket): Row => ({
  min: centsToInput(b.minCents),
  max: b.maxCents === null ? "" : centsToInput(b.maxCents),
  pct: String(b.pct).replace(".", ","),
});

const pctToNumber = (raw: string) => {
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const field =
  "field-luxe h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-sm text-cream tabular-nums outline-none";

/** Editor da tabela progressiva de comissão de serviços (admin da rede). */
export function CommissionBracketsForm({ initial }: { initial: CommissionBracket[] }) {
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial.map(toRow) : DEFAULT_BRACKETS_2026.map(toRow)));
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (i: number, part: Partial<Row>) => {
    setResult(null);
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...part } : r)));
  };

  // Exemplo vivo com as faixas sendo editadas: R$ 15.000 de serviços no mês.
  const preview = (() => {
    const parsed: CommissionBracket[] = rows.map((r) => ({
      minCents: moneyToCents(r.min) ?? -1,
      maxCents: r.max.trim() === "" ? null : (moneyToCents(r.max) ?? -1),
      pct: pctToNumber(r.pct),
    }));
    const hit = bracketFor(parsed.filter((b) => b.minCents >= 0 && Number.isFinite(b.pct)), 1_500_000);
    return hit ? { pct: hit.pct, value: Math.round((1_500_000 * hit.pct) / 100) } : null;
  })();

  const save = () => {
    const parsed: CommissionBracket[] = rows.map((r) => ({
      minCents: moneyToCents(r.min) ?? -1,
      maxCents: r.max.trim() === "" ? null : (moneyToCents(r.max) ?? -1),
      pct: pctToNumber(r.pct),
    }));
    startTransition(async () => {
      const res = await saveCommissionBracketsAction(parsed);
      setResult(
        res.ok
          ? { ok: true, message: "Tabela salva. As comissões já passam a usar as novas faixas." }
          : { ok: false, message: res.message },
      );
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {result ? (
        <FormAlert tone={result.ok ? "success" : "error"} onClose={() => setResult(null)}>
          {result.message}
        </FormAlert>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem_2.75rem] gap-2 border-b border-border bg-black/25 px-3 py-2.5 sm:gap-3 sm:px-4">
          {["De (R$)", "Até (R$)", "%", ""].map((h, i) => (
            <span key={i} className="label-caps text-[0.6rem]">
              {h}
            </span>
          ))}
        </div>
        <ul className="divide-y divide-border/70">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem_2.75rem] items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
              <input
                value={r.min}
                onChange={(e) => patch(i, { min: maskMoney(e.target.value) })}
                inputMode="decimal"
                aria-label={`Faixa ${i + 1}: de`}
                placeholder="1,00"
                className={field}
              />
              <input
                value={r.max}
                onChange={(e) => patch(i, { max: maskMoney(e.target.value) })}
                inputMode="decimal"
                aria-label={`Faixa ${i + 1}: até`}
                placeholder={i === rows.length - 1 ? "Sem teto" : "10.738,73"}
                className={field}
              />
              <span className="relative block">
                <input
                  value={r.pct}
                  onChange={(e) => patch(i, { pct: e.target.value.replace(/[^\d,]/g, "").slice(0, 5) })}
                  inputMode="decimal"
                  aria-label={`Faixa ${i + 1}: percentual`}
                  placeholder="25"
                  className={cn(field, "pr-7")}
                />
                <span className="pointer-events-none absolute inset-y-0 right-0 flex w-7 items-center justify-center text-sm text-muted-foreground">
                  %
                </span>
              </span>
              <button
                type="button"
                onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}
                disabled={rows.length <= 1}
                aria-label={`Remover faixa ${i + 1}`}
                title="Remover faixa"
                className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Cada faixa começa onde a anterior termina (+ R$ 0,01). "Até" vazio na última faixa = sem teto.
        {preview ? (
          <>
            {" "}
            Exemplo com esta tabela: quem vender <strong className="font-medium text-cream">R$ 15.000,00</strong> em
            serviços no mês cai na faixa de{" "}
            <strong className="font-medium text-cream">{String(preview.pct).replace(".", ",")}%</strong> e recebe{" "}
            <strong className="font-medium text-cream">{formatBRL(preview.value)}</strong> de comissão de serviços.
          </>
        ) : null}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="luxe" size="lg" onClick={save} disabled={pending}>
          <Save className="size-4" aria-hidden="true" />
          {pending ? "Salvando…" : "Salvar tabela"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setRows((cur) => [...cur, { min: "", max: "", pct: "" }])}
          disabled={pending}
        >
          <Plus className="size-4" aria-hidden="true" />
          Adicionar faixa
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => {
            setResult(null);
            setRows(DEFAULT_BRACKETS_2026.map(toRow));
          }}
          disabled={pending}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Restaurar tabela de 2026
        </Button>
      </div>
    </div>
  );
}
