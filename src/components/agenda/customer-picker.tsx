"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Phone, Search, UserPlus, UserRound, X } from "lucide-react";
import { quickCreateCustomerAction, searchCustomersAction } from "@/app/u/[slug]/agenda/actions";
import { Field } from "@/components/unit/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgendaCustomerHit } from "@/lib/agenda/types";
import { maskPhone } from "@/lib/validation/barber";
import { cn } from "@/lib/utils";

export type CustomerChoice = {
  mode: "registered" | "walkin";
  selected: AgendaCustomerHit | null;
  name: string;
  phone: string;
};

type Props = {
  slug: string;
  value: CustomerChoice;
  onChange: (next: CustomerChoice) => void;
  errors: Record<string, string | undefined>;
  disabled?: boolean;
};

const MODES = [
  { value: "registered", label: "Cliente cadastrado", icon: UserRound },
  { value: "walkin", label: "Sem cadastro", icon: UserPlus },
] as const;

/**
 * Escolha do cliente do agendamento: busca na rede, cadastra rápido no próprio modal
 * (nome, sobrenome e telefone) ou usa avulso sem cadastro.
 */
export function CustomerPicker({ slug, value, onChange, errors, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AgendaCustomerHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const id = ++seq.current;
    if (q.length < 2) {
      const t = setTimeout(() => {
        if (seq.current === id) {
          setHits([]);
          setSearched(false);
          setLoading(false);
        }
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const found = await searchCustomersAction(slug, q);
      if (seq.current !== id) return;
      setHits(found);
      setSearched(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, slug]);

  const set = (patch: Partial<CustomerChoice>) => onChange({ ...value, ...patch });

  function openCreate() {
    setCreating(true);
    setCreateErrors({});
    setCreateMessage(null);
    const digits = query.replace(/\D/g, "");
    if (digits.length >= 10) {
      setPhone(maskPhone(query));
      setFirstName("");
      setLastName("");
    } else if (query.trim().length >= 2) {
      const parts = query.trim().split(/\s+/);
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
      setPhone("");
    } else {
      setFirstName("");
      setLastName("");
      setPhone("");
    }
  }

  function submitCreate() {
    setCreateErrors({});
    setCreateMessage(null);
    startTransition(async () => {
      const r = await quickCreateCustomerAction(slug, { firstName, lastName, phone });
      if (!r.ok) {
        setCreateErrors(r.fieldErrors ?? {});
        setCreateMessage(r.message);
        return;
      }
      set({ mode: "registered", selected: r.customer });
      setCreating(false);
      setQuery("");
      setHits([]);
      setSearched(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="customerMode" value={value.mode} />

      <div role="group" aria-label="Tipo de cliente" className="grid grid-cols-2 gap-2">
        {MODES.map(({ value: m, label, icon: Icon }) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            aria-pressed={value.mode === m}
            onClick={() => {
              setCreating(false);
              set({ mode: m });
            }}
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              value.mode === m
                ? "border-gold bg-gold/10 text-gold"
                : "border-border text-muted-foreground hover:border-gold/40 hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {value.mode === "registered" ? (
        <div className="flex flex-col gap-2">
          <input type="hidden" name="customerId" value={value.selected?.id ?? ""} />
          {value.selected ? (
            <div className="flex items-center gap-3 rounded-xl border border-gold/50 bg-gold/[0.07] px-3.5 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-[#101010] text-gold">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{value.selected.name}</span>
                {value.selected.phone ? (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="size-3 text-gold/80" aria-hidden="true" />
                    {maskPhone(value.selected.phone)}
                  </span>
                ) : null}
              </span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => {
                    set({ selected: null });
                    setQuery("");
                    setCreating(false);
                  }}
                  className="label-caps flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-2 text-[0.65rem] transition-colors hover:border-gold/50 hover:text-gold"
                >
                  <X className="size-3" aria-hidden="true" />
                  Trocar
                </button>
              ) : null}
            </div>
          ) : creating ? (
            <div className="flex flex-col gap-3 rounded-xl border border-gold/30 bg-gold/[0.04] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-heading text-sm font-semibold uppercase tracking-wide">Novo cliente</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Nome, sobrenome e telefone</p>
                </div>
                <button
                  type="button"
                  disabled={pending || disabled}
                  onClick={() => setCreating(false)}
                  className="label-caps cursor-pointer rounded-md px-2 py-1 text-[0.65rem] text-muted-foreground hover:text-foreground"
                >
                  Voltar
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="quickFirstName" label="Nome" error={createErrors.firstName}>
                  <Input
                    id="quickFirstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={60}
                    autoComplete="off"
                    disabled={pending || disabled}
                    autoFocus
                    aria-invalid={createErrors.firstName ? true : undefined}
                  />
                </Field>
                <Field id="quickLastName" label="Sobrenome" error={createErrors.lastName}>
                  <Input
                    id="quickLastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={60}
                    autoComplete="off"
                    disabled={pending || disabled}
                    aria-invalid={createErrors.lastName ? true : undefined}
                  />
                </Field>
              </div>
              <Field id="quickPhone" label="Telefone" error={createErrors.phone}>
                <Input
                  id="quickPhone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(11) 91234-5678"
                  autoComplete="off"
                  disabled={pending || disabled}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCreate();
                    }
                  }}
                  aria-invalid={createErrors.phone ? true : undefined}
                />
              </Field>
              {createMessage && !createErrors.firstName && !createErrors.lastName && !createErrors.phone ? (
                <p className="text-xs text-destructive">{createMessage}</p>
              ) : null}
              <Button type="button" variant="luxe" size="sm" disabled={pending || disabled} onClick={submitCreate} className="h-10">
                {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Cadastrar e usar
              </Button>
            </div>
          ) : (
            <>
              <div className="group relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
                  {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
                </span>
                <input
                  id="customer-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nome, telefone, CPF ou e-mail"
                  aria-label="Buscar cliente"
                  aria-invalid={errors.customerId ? true : undefined}
                  autoComplete="off"
                  maxLength={60}
                  disabled={disabled}
                  className="field-luxe h-11 w-full min-w-0 rounded-lg border border-input pl-11 pr-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
                />
              </div>

              {hits.length > 0 ? (
                <ul className="scroll-luxe flex max-h-56 flex-col overflow-y-auto rounded-xl border border-border bg-[#0b0b0b]/60 p-1" aria-label="Clientes encontrados">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => set({ selected: h })}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gold/10"
                      >
                        <UserRound className="size-4 shrink-0 text-gold/80" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{h.name}</span>
                        {h.phone ? <span className="shrink-0 text-xs text-muted-foreground">{maskPhone(h.phone)}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : searched && !loading ? (
                <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border px-3.5 py-3.5">
                  <p className="text-sm text-muted-foreground">Nenhum cliente encontrado com essa busca.</p>
                  <Button type="button" variant="outline" size="sm" onClick={openCreate} disabled={disabled} className="h-10 gap-2">
                    <UserPlus className="size-4" />
                    Cadastrar cliente
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={openCreate}
                  className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border text-sm text-muted-foreground transition-colors hover:border-gold/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UserPlus className="size-4" />
                  Cadastrar novo cliente
                </button>
              )}
            </>
          )}
          {errors.customerId ? <p className="text-xs text-destructive">{errors.customerId}</p> : null}
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-[#121212] px-3.5 py-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
            <UserPlus className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Cliente sem cadastro</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sem nome nem telefone — para quem não quer informar dados. O horário fica só na agenda.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
