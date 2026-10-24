"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ArrowRight, Check, ClipboardList, Layers, Loader2, Minus, Plus, Wallet } from "lucide-react";
import { createPackageAction, updatePackageAction } from "@/app/u/[slug]/pacotes/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { packagePriceCents, parsePercentBR, type PackagePriceMode } from "@/lib/packages/math";
import { initialPackageState } from "@/lib/packages/types";
import { formatBRL, maskMoney, moneyToCents } from "@/lib/validation/service";
import { cn } from "@/lib/utils";
import { Field, FormSection } from "./form-parts";

export type PackageServiceOption = { id: string; name: string; priceCents: number };
export type PackageDefaults = {
  name: string;
  description: string;
  priceMode: PackagePriceMode;
  discountPct: string;
  fixedPrice: string;
  validityDays: string;
  items: { serviceId: string; quantity: number }[];
};

export const EMPTY_PACKAGE_DEFAULTS: PackageDefaults = {
  name: "",
  description: "",
  priceMode: "desconto",
  discountPct: "10",
  fixedPrice: "",
  validityDays: "",
  items: [],
};

export function PackageForm({
  slug,
  mode,
  packageId,
  defaults,
  services,
  editStatus,
}: {
  slug: string;
  mode: "create" | "edit";
  packageId?: string;
  defaults: PackageDefaults;
  services: PackageServiceOption[];
  editStatus?: React.ReactNode;
}) {
  const editing = mode === "edit";
  const [state, formAction, pending] = useActionState(
    editing ? updatePackageAction.bind(null, slug, packageId ?? "") : createPackageAction.bind(null, slug),
    initialPackageState,
  );
  const [closedNotice, setClosedNotice] = useState<unknown>(null);
  const fe = state.fieldErrors ?? {};
  const val = (k: "name" | "description" | "discountPct" | "fixedPrice" | "validityDays") => state.values?.[k] ?? defaults[k];

  const [name, setName] = useState(val("name"));
  const [description, setDescription] = useState(val("description"));
  const [priceMode, setPriceMode] = useState<PackagePriceMode>(
    () => (state.values?.priceMode === "fixo" ? "fixo" : defaults.priceMode),
  );
  const [discountPct, setDiscountPct] = useState(val("discountPct"));
  const [fixedPrice, setFixedPrice] = useState(() => maskMoney(val("fixedPrice")));
  const [validityDays, setValidityDays] = useState(val("validityDays"));
  const [picked, setPicked] = useState<Map<string, number>>(
    () => new Map(defaults.items.map((i) => [i.serviceId, i.quantity])),
  );

  const chosen = useMemo(
    () =>
      services
        .filter((s) => picked.has(s.id))
        .map((s) => ({ ...s, quantity: picked.get(s.id) ?? 1 })),
    [picked, services],
  );
  const listCents = chosen.reduce((n, s) => n + s.quantity * s.priceCents, 0);
  const pct = parsePercentBR(discountPct);
  const pctValid = Number.isFinite(pct) && pct >= 0 && pct <= 90;
  const fixedCents = moneyToCents(fixedPrice);
  // Sem valor válido digitado, a prévia mostra o valor cheio (não R$ 0,00).
  const priceCents =
    priceMode === "fixo"
      ? (fixedCents ?? listCents)
      : pctValid
        ? packagePriceCents(listCents, pct)
        : listCents;
  const totalServices = chosen.reduce((n, s) => n + s.quantity, 0);

  const itemsJson = JSON.stringify(chosen.map((s) => ({ serviceId: s.id, quantity: s.quantity })));
  const base = `/u/${slug}/pacotes`;

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Map(cur);
      if (next.has(id)) next.delete(id);
      else next.set(id, 1);
      return next;
    });
  }
  function setQty(id: string, qty: number) {
    setPicked((cur) => new Map(cur).set(id, Math.min(50, Math.max(1, qty))));
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="items" value={itemsJson} />
        {state.status === "error" && state.message ? <FormAlert tone="error">{state.message}</FormAlert> : null}
        {state.status === "success" && editing && closedNotice !== state ? (
          <Notice title="Alterações salvas" onClose={() => setClosedNotice(state)}>
            O pacote foi atualizado. Quem já comprou continua com o pacote antigo (foto da venda).
          </Notice>
        ) : null}

        <FormSection icon={ClipboardList} title="Dados do pacote" description="Como o pacote aparece para a recepção vender.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="name" label="Nome do pacote" error={fe.name} className="sm:col-span-2">
              <Input
                id="name"
                name="name"
                className="field-luxe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Pacote Mensal — 4 cortes"
                autoComplete="off"
                aria-invalid={!!fe.name}
              />
            </Field>
            <Field id="description" label="Descrição (opcional)" error={fe.description} className="sm:col-span-2">
              <Textarea
                id="description"
                name="description"
                rows={2}
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Para quem corta toda semana. Vale em qualquer dia."
                aria-invalid={!!fe.description}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          icon={Layers}
          title="Serviços do pacote"
          description="Marque os serviços e quantas vezes cada um entra. É esse saldo que baixa a cada visita."
        >
          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum serviço ativo nesta unidade. Cadastre os serviços primeiro, em Serviços.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {services.map((s) => {
                const on = picked.has(s.id);
                const qty = picked.get(s.id) ?? 1;
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                      on ? "border-gold/40 bg-gold/[0.05]" : "border-border/80 bg-black/20",
                    )}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`Incluir ${s.name}`}
                      onClick={() => toggle(s.id)}
                      className={cn(
                        "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors",
                        on ? "border-gold bg-gold text-[#171310]" : "border-border text-transparent hover:border-gold/50",
                      )}
                    >
                      <Check className="size-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => toggle(s.id)} className="min-w-0 flex-1 cursor-pointer text-left">
                      <span className={cn("block truncate text-sm font-medium", on ? "text-cream" : "text-muted-foreground")}>
                        {s.name}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">{formatBRL(s.priceCents)} cada</span>
                    </button>
                    {on ? (
                      <span className="flex h-10 items-center gap-0.5 rounded-lg border border-input bg-[rgb(8_8_8/0.5)] px-1">
                        <button
                          type="button"
                          className="flex size-8 cursor-pointer items-center justify-center rounded-md text-cream hover:bg-gold/10 hover:text-gold"
                          onClick={() => setQty(s.id, qty - 1)}
                          aria-label={`Diminuir ${s.name}`}
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm tabular-nums text-cream">{qty}×</span>
                        <button
                          type="button"
                          className="flex size-8 cursor-pointer items-center justify-center rounded-md text-cream hover:bg-gold/10 hover:text-gold"
                          onClick={() => setQty(s.id, qty + 1)}
                          aria-label={`Aumentar ${s.name}`}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {fe.items ? <p className="mt-3 text-sm text-destructive">{fe.items}</p> : null}
        </FormSection>

        <FormSection icon={Wallet} title="Preço e validade" description="O cliente paga o pacote uma vez; depois só usa.">
          <input type="hidden" name="priceMode" value={priceMode} />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="label-caps text-[0.65rem]">Valor do pacote</span>
              <div className="grid max-w-xs grid-cols-2 overflow-hidden rounded-lg border border-border" role="group" aria-label="Como definir o valor do pacote">
                {(
                  [
                    { value: "desconto", label: "Desconto (%)" },
                    { value: "fixo", label: "Valor fixo (R$)" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={priceMode === o.value}
                    onClick={() => setPriceMode(o.value)}
                    className={cn(
                      "h-10 cursor-pointer border-r border-border text-xs last:border-r-0",
                      priceMode === o.value ? "bg-gold font-medium text-[#1a1408]" : "bg-black/20 text-muted-foreground hover:text-cream",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {priceMode === "desconto" ? (
                <Field id="discountPct" label="Desconto do pacote (%)" error={fe.discountPct} hint="Sobre a soma dos serviços. Ex.: 20. Máximo de 90%.">
                  <div className="group relative max-w-[10rem]">
                    <Input
                      id="discountPct"
                      name="discountPct"
                      inputMode="decimal"
                      className="field-luxe pr-10"
                      value={discountPct}
                      onChange={(e) => {
                        // Limita já na digitação: acima de 90% trava em 90 (o servidor
                        // aceita de 0 a 90; digitar "10120" não pode passar).
                        const clean = e.target.value.replace(/[^\d,]/g, "").slice(0, 6);
                        const n = parsePercentBR(clean);
                        setDiscountPct(Number.isFinite(n) && n > 90 ? "90" : clean);
                      }}
                      placeholder="10"
                      aria-invalid={!!fe.discountPct}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </Field>
              ) : (
                <Field id="fixedPrice" label="Valor fixo do pacote" error={fe.fixedPrice} hint="Valor fechado, sem passar da soma dos serviços.">
                  <div className="group relative max-w-[10rem]">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center justify-center text-sm text-muted-foreground">
                      R$
                    </span>
                    <Input
                      id="fixedPrice"
                      name="fixedPrice"
                      inputMode="decimal"
                      className="field-luxe pl-10"
                      value={fixedPrice}
                      onChange={(e) => setFixedPrice(maskMoney(e.target.value))}
                      placeholder="0,00"
                      aria-invalid={!!fe.fixedPrice}
                    />
                  </div>
                </Field>
              )}
            </div>
            <Field id="validityDays" label="Validade (dias, opcional)" error={fe.validityDays} hint="Conta da cobrança da venda. Vazio = sem validade.">
              <Input
                id="validityDays"
                name="validityDays"
                inputMode="numeric"
                className="field-luxe max-w-[10rem]"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value.replace(/\D/g, ""))}
                placeholder="Ex.: 90"
                aria-invalid={!!fe.validityDays}
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-border bg-[#0b0b0b]/40 px-4 py-3.5" aria-live="polite">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              <Layers className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-base font-semibold uppercase tracking-wide">
                {name.trim() || "Nome do pacote"}
              </p>
              <p className="text-sm text-muted-foreground">
                {totalServices
                  ? `${totalServices} ${totalServices === 1 ? "serviço" : "serviços"} · vale ${formatBRL(listCents)}`
                  : "Escolha os serviços acima"}
              </p>
            </div>
            <div className="text-right">
              {listCents && priceCents < listCents ? (
                <p className="text-xs tabular-nums text-muted-foreground line-through">{formatBRL(listCents)}</p>
              ) : null}
              <p className="font-heading text-xl font-semibold tabular-nums text-gold">
                {listCents ? formatBRL(priceCents) : "R$ --"}
              </p>
            </div>
          </div>
        </FormSection>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="luxe" size="lg" className="w-full sm:w-auto" disabled={pending || chosen.length === 0}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {pending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar pacote"}
            {pending ? null : <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />}
          </Button>
          <Link href={base} className={buttonVariants({ variant: "outline", size: "lg", className: "w-full sm:w-auto" })}>
            {editing ? "Voltar" : "Cancelar"}
          </Link>
        </div>
      </form>

      {editing && editStatus ? <div className="flex flex-col gap-5">{editStatus}</div> : null}
    </div>
  );
}
