"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, ClipboardList, Clock, Loader2, Power, Users, Wallet } from "lucide-react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createServiceAction, updateServiceAction } from "@/app/u/[slug]/servicos/actions";
import { SERVICE_IMAGE_BUCKET, initialServiceState, type AssignableBarber } from "@/lib/services/types";
import {
  DURATIONS,
  formatBRL,
  formatDuration,
  maskMoney,
  moneyToCents,
  priceProblem,
} from "@/lib/validation/service";
import { Field, FormSection } from "./form-parts";
import { CATEGORY_OPTIONS } from "./service-categories";
import { PhotoUploader } from "./photo-uploader";
import { ServiceBarberPicker } from "./service-barber-picker";
import { ServiceIcon, ServiceThumb } from "./service-icon";
import { TabList, type TabDef } from "./tab-list";

/** Valores iniciais do formulário (strings, como vêm de um <form>). */
export type ServiceDefaults = {
  name: string;
  category: string;
  description: string;
  /** Minutos, como texto ("30"). */
  duration: string;
  /** Já no formato do campo ("45,00") ou vazio. */
  price: string;
  /** Caminho da imagem no bucket (ou "") e a URL pública para pré-visualizar. */
  imagePath: string;
  imageUrl: string | null;
  /** Profissionais que já fazem o serviço -> duração própria em minutos ("" = padrão). */
  barberMinutes: Record<string, string>;
};

export const EMPTY_SERVICE_DEFAULTS: ServiceDefaults = {
  name: "",
  category: "cabelo",
  description: "",
  duration: "30",
  price: "",
  imagePath: "",
  imageUrl: null,
  barberMinutes: {},
};

type TabId = "dados" | "preco" | "equipe" | "situacao";

const DURATION_OPTIONS: SelectOption[] = DURATIONS.map((m) => ({ value: String(m), label: formatDuration(m), icon: Clock }));

/** Em qual aba mora cada campo (para abrir a aba certa quando há erro). */
function tabOf(field: string): TabId {
  return field === "price" || field === "duration" ? "preco" : "dados";
}

type Props = {
  slug: string;
  unitId: string;
  defaults: ServiceDefaults;
  /** Profissionais ativos da unidade (para escolher quem faz o serviço). */
  barbers: AssignableBarber[];
  mode: "create" | "edit";
  /** Cadastro: id novo gerado pela página (nome do arquivo da imagem). Edição: id do serviço. */
  serviceId: string;
  /** Edição: conteúdo da aba "Situação" (ativar/desativar), renderizado no servidor. */
  editStatus?: React.ReactNode;
};

export function ServiceForm({ slug, unitId, defaults, barbers, mode, serviceId, editStatus }: Props) {
  const editing = mode === "edit";
  const [state, formAction, pending] = useActionState(
    editing ? updateServiceAction.bind(null, slug, serviceId) : createServiceAction.bind(null, slug),
    initialServiceState,
  );
  const [tab, setTab] = useState<TabId>("dados");
  const [closedNotice, setClosedNotice] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const [barberMinutes, setBarberMinutes] = useState(defaults.barberMinutes);

  const fe = state.fieldErrors ?? {};
  // Depois de um erro o React 19 limpa campos não controlados: devolvemos o que foi digitado.
  const val = (k: Exclude<keyof ServiceDefaults, "imageUrl" | "barberMinutes">) => state.values?.[k] ?? defaults[k];
  const base = `/u/${slug}/servicos`;

  const tabs: TabDef<TabId>[] = [
    { id: "dados", label: "Dados do serviço", icon: ClipboardList },
    { id: "preco", label: "Preço e duração", icon: Wallet },
    { id: "equipe", label: "Profissionais", icon: Users },
    ...(editing ? [{ id: "situacao" as const, label: "Situação", icon: Power }] : []),
  ];

  // Abas com erro ganham um ponto; a primeira delas abre sozinha a cada resposta com erro.
  const errorTabs = new Set(Object.keys(fe).map(tabOf));
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const first = tabs.find((t) => errorTabs.has(t.id));
    if (state.status === "error" && first) setTab(first.id);
  }

  // Campos controlados: o resumo do serviço acompanha o que se digita.
  const [name, setName] = useState(val("name"));
  const [category, setCategory] = useState(val("category"));
  const [description, setDescription] = useState(val("description"));
  const [duration, setDuration] = useState(val("duration"));
  const [price, setPrice] = useState(maskMoney(val("price")));
  const [priceBlur, setPriceBlur] = useState<string | undefined>();
  const [errSeen, setErrSeen] = useState(state);
  if (state !== errSeen) {
    setErrSeen(state);
    setPriceBlur(undefined);
  }
  const priceErr = priceBlur ?? fe.price;

  const panel = (id: TabId) => ({
    role: "tabpanel" as const,
    id: `service-panel-${id}`,
    "aria-labelledby": `service-tab-${id}`,
    hidden: tab !== id,
    className: "flex flex-col gap-5",
  });

  const cents = moneyToCents(price);
  const showFooter = !editing || tab !== "situacao";

  return (
    <div className="flex flex-col gap-6">
      <div className="reveal" style={{ "--d": "60ms" } as React.CSSProperties}>
        <TabList tabs={tabs} active={tab} onChange={setTab} errorTabs={errorTabs} idPrefix="service" label="Etapas do cadastro do serviço" />
      </div>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        {!editing ? <input type="hidden" name="id" value={serviceId} /> : null}
        {Object.entries(barberMinutes).map(([id, minutes]) => (
          <span key={id} hidden>
            <input type="hidden" name="barberIds" value={id} />
            <input type="hidden" name={`barberMinutes_${id}`} value={minutes} />
          </span>
        ))}
        {state.status === "error" && state.message ? (
          <FormAlert key={state.message} tone="error">
            {state.message}
          </FormAlert>
        ) : null}
        {state.status === "success" && editing && closedNotice !== state ? (
          <Notice title="Alterações salvas" onClose={() => setClosedNotice(state)}>
            Os dados do serviço foram atualizados.
          </Notice>
        ) : null}

        {/* ---------- Dados do serviço ---------- */}
        <div {...panel("dados")}>
          <FormSection icon={ClipboardList} title="Dados do serviço" description="Como o serviço aparece na agenda e no caixa.">
            <div className="flex flex-col gap-6">
              <PhotoUploader
                unitId={unitId}
                barberId={serviceId}
                bucket={SERVICE_IMAGE_BUCKET}
                fieldName="imagePath"
                noun="imagem"
                shape="rounded"
                outSize={640}
                targetBytes={70 * 1024}
                initialPath={state.values?.imagePath ?? defaults.imagePath}
                initialUrl={defaults.imageUrl}
                onBusyChange={setUploading}
                renderPreview={(url) => (
                  <ServiceThumb url={url} category={category} className="size-24 rounded-2xl" iconClassName="size-9" />
                )}
              />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="name" label="Nome do serviço" error={fe.name} className="sm:col-span-2">
                <Input
                  id="name"
                  name="name"
                  className="field-luxe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Corte masculino"
                  autoComplete="off"
                  aria-invalid={!!fe.name}
                />
              </Field>
              <Field id="category" label="Categoria" error={fe.category}>
                <Select
                  id="category"
                  name="category"
                  value={category}
                  onValueChange={setCategory}
                  options={CATEGORY_OPTIONS}
                  invalid={!!fe.category}
                />
              </Field>
              <span className="hidden sm:block" />
              <Field
                id="description"
                label="Descrição (opcional)"
                error={fe.description}
                hint="Aparece para a recepção na hora de agendar."
                className="sm:col-span-2"
              >
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  maxLength={300}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Corte na máquina e tesoura, com acabamento na navalha."
                  aria-invalid={!!fe.description}
                />
                <span className="text-right text-xs text-muted-foreground">{description.length}/300</span>
              </Field>
            </div>
            </div>
          </FormSection>
        </div>

        {/* ---------- Preço e duração ---------- */}
        <div {...panel("preco")}>
          <FormSection icon={Wallet} title="Preço e duração" description="Valor cobrado e tempo reservado na agenda.">
            <div className="flex flex-col gap-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="price" label="Preço" error={priceErr} hint="Use 0,00 para serviço sem custo.">
                  <div className="group relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-sm text-muted-foreground transition-colors group-focus-within:text-gold">
                      R$
                    </span>
                    <Input
                      id="price"
                      name="price"
                      inputMode="numeric"
                      className="field-luxe pl-11"
                      value={price}
                      placeholder="0,00"
                      autoComplete="off"
                      aria-invalid={!!priceErr}
                      onChange={(e) => {
                        setPrice(maskMoney(e.target.value));
                        setPriceBlur("");
                      }}
                      onBlur={() => setPriceBlur(priceProblem(price) ?? "")}
                    />
                  </div>
                </Field>
                <Field id="duration" label="Duração" error={fe.duration} hint="Tempo que o serviço ocupa na agenda.">
                  <Select
                    id="duration"
                    name="duration"
                    value={duration}
                    onValueChange={setDuration}
                    options={DURATION_OPTIONS}
                    invalid={!!fe.duration}
                  />
                </Field>
              </div>

              {/* Resumo: como o serviço fica na lista */}
              <div className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-[#0b0b0b]/40 px-4 py-3.5" aria-live="polite">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
                  <ServiceIcon category={category} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-base font-semibold uppercase tracking-wide">
                    {name.trim() || "Nome do serviço"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDuration(Number(duration))}
                  </p>
                </div>
                <p className="font-heading text-xl font-semibold text-gold">
                  {cents === null ? "R$ --" : formatBRL(cents)}
                </p>
              </div>
            </div>
          </FormSection>
        </div>

        {/* ---------- Profissionais ---------- */}
        <div {...panel("equipe")}>
          <FormSection icon={Users} title="Quem realiza" description="Profissionais habilitados a fazer este serviço na agenda.">
            <ServiceBarberPicker
              slug={slug}
              barbers={barbers}
              selected={barberMinutes}
              defaultMinutes={Number(duration)}
              onChange={setBarberMinutes}
            />
          </FormSection>
        </div>

        {showFooter ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="luxe" size="lg" className="w-full sm:w-auto" disabled={pending || uploading}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar serviço"}
              {pending ? null : (
                <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
              )}
            </Button>
            <Link href={base} className={buttonVariants({ variant: "outline", size: "lg", className: "w-full sm:w-auto" })}>
              {editing ? "Voltar" : "Cancelar"}
            </Link>
          </div>
        ) : null}
      </form>

      {/* Edição: aba Situação fora do <form> (tem formulário próprio) */}
      {editing ? (
        <div role="tabpanel" id="service-panel-situacao" aria-labelledby="service-tab-situacao" hidden={tab !== "situacao"} className="flex flex-col gap-5">
          {editStatus}
        </div>
      ) : null}
    </div>
  );
}
