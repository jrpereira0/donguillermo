"use client";

import { useActionState, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Clock,
  ImageIcon,
  Info,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Store,
  Trash2,
} from "lucide-react";
import { HoursFields } from "@/components/admin/hours-fields";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { lookupUnitCepAction, updateUnitSettingsAction } from "@/app/u/[slug]/configuracoes/actions";
import { UNIT_ASSET_BUCKET, initialUnitSettingsState } from "@/lib/units/types";
import { cnpjProblem, maskCnpj, maskPhone, onlyDigits } from "@/lib/validation/barber";
import {
  PHONE_LABEL_MAX,
  PHONE_LIMIT,
  SLOT_OPTIONS,
  misalignedServices,
  slotLabel,
  type UnitPhone,
} from "@/lib/validation/unit-settings";
import { Field, FormSection } from "./form-parts";
import { PhotoUploader } from "./photo-uploader";
import { TabList, type TabDef } from "./tab-list";

/** Valores iniciais (strings, como vêm de um <form>). */
export type UnitSettingsDefaults = {
  name: string;
  cnpj: string;
  cep: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  slotMinutes: number;
  openingHours: unknown;
  phones: UnitPhone[];
  logoPath: string;
  logoUrl: string | null;
  coverPath: string;
  coverUrl: string | null;
  /** Endereço antigo em uma linha, mostrado como lembrete enquanto os campos estiverem vazios. */
  legacyAddress: string | null;
};

type TabId = "identidade" | "contato" | "funcionamento";

const TABS: TabDef<TabId>[] = [
  { id: "identidade", label: "Identidade", icon: Store },
  { id: "contato", label: "Contato", icon: Phone },
  { id: "funcionamento", label: "Funcionamento", icon: Clock },
];

const ICON = "size-4";

const SLOT_SELECT: SelectOption[] = SLOT_OPTIONS.map((m) => ({ value: String(m), label: slotLabel(m) }));

/** Campos de cada aba, para abrir a aba certa quando o servidor devolve erro. */
const TAB_OF_FIELD = (key: string): TabId => {
  if (key === "name" || key === "cnpj") return "identidade";
  if (key.startsWith("hours_") || key === "slotMinutes") return "funcionamento";
  return "contato"; // telefones e endereço
};

const maskCep = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

/** Campo de texto com ícone à esquerda (mesmo padrão do login). */
function IconInput({ icon, ...props }: React.ComponentProps<typeof Input> & { icon: React.ReactNode }) {
  return (
    <div className="group relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
        {icon}
      </span>
      <Input {...props} className="field-luxe pl-11" />
    </div>
  );
}

type PhoneRow = { key: number; label: string; number: string; whatsapp: boolean };

export function UnitSettingsForm({
  slug,
  unitId,
  defaults,
  serviceDurations,
}: {
  slug: string;
  unitId: string;
  defaults: UnitSettingsDefaults;
  /** Durações (min) dos serviços ativos, para avisar quando não fecham com a linha da agenda. */
  serviceDurations: number[];
}) {
  const [state, formAction, pending] = useActionState(
    updateUnitSettingsAction.bind(null, slug),
    initialUnitSettingsState,
  );
  const [uploading, setUploading] = useState(false);
  const [closedNotice, setClosedNotice] = useState<unknown>(null);
  const [tab, setTab] = useState<TabId>("identidade");

  const fe = state.fieldErrors ?? {};
  // Depois de um erro o React 19 limpa campos não controlados: devolvemos o que foi digitado.
  const val = (k: keyof UnitSettingsDefaults) => state.values?.[k] ?? String(defaults[k] ?? "");

  const errorTabs = new Set<TabId>(Object.keys(fe).map(TAB_OF_FIELD));
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const first = TABS.find((t) => errorTabs.has(t.id));
    if (state.status === "error" && first) setTab(first.id);
  }

  // CNPJ: máscara enquanto digita e aviso ao sair do campo.
  const [cnpj, setCnpj] = useState(maskCnpj(val("cnpj")));
  const [cnpjErr, setCnpjErr] = useState<string | undefined>();
  const cnpjError = cnpjErr ?? fe.cnpj;

  // Endereço: controlado, porque o CEP preenche vários campos de uma vez.
  const [addr, setAddr] = useState({
    cep: maskCep(val("cep")),
    street: val("street"),
    neighborhood: val("neighborhood"),
    city: val("city"),
    state: val("state"),
  });
  const [cepBusy, setCepBusy] = useState(false);
  const [cepMsg, setCepMsg] = useState<string | undefined>();
  const numberRef = useRef<HTMLInputElement>(null);

  async function searchCep(value: string) {
    if (onlyDigits(value).length !== 8) return setCepMsg("Informe os 8 dígitos do CEP.");
    setCepBusy(true);
    setCepMsg(undefined);
    const r = await lookupUnitCepAction(slug, value);
    setCepBusy(false);
    if (!r.ok) return setCepMsg(r.message);
    setAddr((a) => ({ ...a, ...r.address }));
    numberRef.current?.focus();
  }

  // Telefones: lista editável; o servidor recebe um JSON só (campo oculto).
  const nextKey = useRef(defaults.phones.length);
  const [phones, setPhones] = useState<PhoneRow[]>(() =>
    defaults.phones.map((p, i) => ({ key: i, label: p.label, number: maskPhone(p.number), whatsapp: p.whatsapp })),
  );
  const [phoneErr, setPhoneErr] = useState<Record<string, string>>({});
  const [seenErr, setSeenErr] = useState(state);
  if (state !== seenErr) {
    setSeenErr(state);
    setPhoneErr({});
  }
  const patchPhone = (key: number, patch: Partial<PhoneRow>, clear?: "label" | "number") => {
    setPhones((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    if (clear) {
      const i = phones.findIndex((r) => r.key === key);
      setPhoneErr((e) => ({ ...e, [`phone_${i}_${clear}`]: "" }));
    }
  };
  const phonesJson = JSON.stringify(
    phones.map((p) => ({ label: p.label, number: onlyDigits(p.number), whatsapp: p.whatsapp })),
  );

  // Agenda
  const [slot, setSlot] = useState(String(state.values?.slotMinutes ?? defaults.slotMinutes));
  const misaligned = misalignedServices(serviceDurations, Number(slot));

  const panel = (id: TabId) => ({
    role: "tabpanel" as const,
    id: `unit-panel-${id}`,
    "aria-labelledby": `unit-tab-${id}`,
    hidden: tab !== id,
    className: "flex flex-col gap-5",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="reveal" style={{ "--d": "60ms" } as React.CSSProperties}>
        <TabList
          tabs={TABS}
          active={tab}
          onChange={setTab}
          errorTabs={errorTabs}
          idPrefix="unit"
          label="Seções das configurações da barbearia"
        />
      </div>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="phones" value={phonesJson} />
        <input type="hidden" name="slotMinutes" value={slot} />

        {state.status === "error" && state.message ? (
          <FormAlert key={state.message} tone="error">
            {state.message}
          </FormAlert>
        ) : null}
        {state.status === "success" && closedNotice !== state ? (
          <Notice title="Configurações salvas" onClose={() => setClosedNotice(state)}>
            Os dados da barbearia foram atualizados.
          </Notice>
        ) : null}

        {/* ---------- Identidade ---------- */}
        <div {...panel("identidade")}>
          <FormSection icon={ImageIcon} title="Marca" description="Logo e foto de capa da barbearia.">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <p className="label-caps">Logo</p>
                <PhotoUploader
                  unitId={unitId}
                  barberId=""
                  bucket={UNIT_ASSET_BUCKET}
                  fieldName="logoPath"
                  noun="logo"
                  mode="fit"
                  outSize={512}
                  targetBytes={60 * 1024}
                  buildPath={(ext) => `${unitId}/${crypto.randomUUID()}.${ext}`}
                  initialPath={state.values?.logoPath ?? defaults.logoPath}
                  initialUrl={defaults.logoUrl}
                  onBusyChange={setUploading}
                  renderPreview={(url) => (
                    <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-[#0b0b0b]/60 p-2">
                      {url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={url} alt="Logo da barbearia" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <Store className="size-8 text-muted-foreground/60" aria-hidden="true" />
                      )}
                    </div>
                  )}
                />
              </div>
              <div className="flex flex-col gap-3">
                <p className="label-caps">Foto de capa</p>
                <PhotoUploader
                  unitId={unitId}
                  barberId=""
                  bucket={UNIT_ASSET_BUCKET}
                  fieldName="coverPath"
                  noun="capa"
                  shape="rounded"
                  aspect={16 / 9}
                  outSize={1280}
                  targetBytes={150 * 1024}
                  buildPath={(ext) => `${unitId}/${crypto.randomUUID()}.${ext}`}
                  initialPath={state.values?.coverPath ?? defaults.coverPath}
                  initialUrl={defaults.coverUrl}
                  onBusyChange={setUploading}
                  renderPreview={(url) => (
                    <div className="grid aspect-video w-full max-w-60 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-[#0b0b0b]/60">
                      {url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={url} alt="Capa da barbearia" className="size-full object-cover" />
                      ) : (
                        <ImageIcon className="size-8 text-muted-foreground/60" aria-hidden="true" />
                      )}
                    </div>
                  )}
                />
                <p className="text-xs text-muted-foreground">Proporção 16:9 (retangular). Use uma foto da fachada ou do salão.</p>
              </div>
            </div>
          </FormSection>

          <FormSection icon={Building2} title="Dados da barbearia" description="Nome exibido no sistema e CNPJ da unidade.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="name" label="Nome da barbearia" error={fe.name} className="sm:col-span-2">
                <Input id="name" name="name" className="field-luxe" defaultValue={val("name")} autoComplete="off" aria-invalid={!!fe.name} />
              </Field>
              <Field id="cnpj" label="CNPJ" error={cnpjError} hint="Opcional.">
                <Input
                  id="cnpj"
                  name="cnpj"
                  className="field-luxe"
                  value={cnpj}
                  placeholder="00.000.000/0000-00"
                  autoComplete="off"
                  aria-invalid={!!cnpjError}
                  onChange={(e) => {
                    setCnpj(maskCnpj(e.target.value));
                    setCnpjErr("");
                  }}
                  onBlur={() => setCnpjErr(cnpjProblem(cnpj) ?? "")}
                />
              </Field>
            </div>
          </FormSection>
        </div>

        {/* ---------- Contato ---------- */}
        <div {...panel("contato")}>
          <FormSection
            icon={Phone}
            title="Telefones"
            description="Aparecem para o cliente. Marque os que atendem por WhatsApp."
          >
            <div className="flex flex-col gap-4">
              {phones.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  Nenhum telefone cadastrado.
                </p>
              ) : null}

              {phones.map((p, i) => {
                const labelErr = phoneErr[`phone_${i}_label`] ?? fe[`phone_${i}_label`];
                const numberErr = phoneErr[`phone_${i}_number`] ?? fe[`phone_${i}_number`];
                return (
                  <div
                    key={p.key}
                    className="grid gap-4 rounded-xl border border-border bg-[#0b0b0b]/40 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
                  >
                    <Field id={`phone-label-${p.key}`} label="Nome" error={labelErr}>
                      <Input
                        id={`phone-label-${p.key}`}
                        className="field-luxe"
                        value={p.label}
                        maxLength={PHONE_LABEL_MAX}
                        placeholder="Ex.: Recepção"
                        autoComplete="off"
                        aria-invalid={!!labelErr}
                        onChange={(e) => patchPhone(p.key, { label: e.target.value }, "label")}
                      />
                    </Field>
                    <Field id={`phone-number-${p.key}`} label="Telefone" error={numberErr}>
                      <IconInput
                        icon={<Phone className={ICON} />}
                        id={`phone-number-${p.key}`}
                        type="tel"
                        inputMode="tel"
                        value={p.number}
                        placeholder="(11) 91234-5678"
                        autoComplete="off"
                        aria-invalid={!!numberErr}
                        onChange={(e) => patchPhone(p.key, { number: maskPhone(e.target.value) }, "number")}
                      />
                    </Field>
                    <div className="flex items-center justify-between gap-3 sm:mt-[1.65rem] sm:justify-end">
                      <Switch
                        checked={p.whatsapp}
                        onChange={(e) => patchPhone(p.key, { whatsapp: e.target.checked })}
                      >
                        <MessageCircle className="size-4 text-gold" aria-hidden="true" />
                        WhatsApp
                      </Switch>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover telefone ${i + 1}`}
                        onClick={() => setPhones((rows) => rows.filter((r) => r.key !== p.key))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {fe.phones ? <p className="text-xs text-destructive">{fe.phones}</p> : null}

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={phones.length >= PHONE_LIMIT}
                  onClick={() =>
                    setPhones((rows) => [
                      ...rows,
                      { key: nextKey.current++, label: rows.length === 0 ? "Recepção" : "", number: "", whatsapp: false },
                    ])
                  }
                >
                  <Plus />
                  Adicionar telefone
                </Button>
                {phones.length >= PHONE_LIMIT ? (
                  <span className="ml-3 text-xs text-muted-foreground">Limite de {PHONE_LIMIT} telefones.</span>
                ) : null}
              </div>
            </div>
          </FormSection>

          <FormSection icon={MapPin} title="Endereço" description="Digite o CEP e o endereço é preenchido sozinho.">
            {defaults.legacyAddress && !defaults.cep && !defaults.street && !defaults.city ? (
              <p className="mb-5 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden="true" />
                <span>
                  Endereço cadastrado antes: <span className="text-foreground">{defaults.legacyAddress}</span>. Preencha os
                  campos abaixo para atualizá-lo.
                </span>
              </p>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-6">
              <Field id="cep" label="CEP" error={fe.cep ?? cepMsg} className="sm:col-span-3">
                <div className="flex gap-2">
                  <Input
                    id="cep"
                    name="cep"
                    inputMode="numeric"
                    className="field-luxe"
                    value={addr.cep}
                    placeholder="00000-000"
                    autoComplete="off"
                    aria-invalid={!!(fe.cep ?? cepMsg)}
                    onChange={(e) => {
                      const v = maskCep(e.target.value);
                      setAddr((a) => ({ ...a, cep: v }));
                      setCepMsg(undefined);
                      if (onlyDigits(v).length === 8) void searchCep(v);
                    }}
                  />
                  <Button type="button" variant="outline" disabled={cepBusy} onClick={() => searchCep(addr.cep)} className="h-11 shrink-0">
                    {cepBusy ? <Loader2 className="animate-spin" /> : <Search />}
                    Buscar
                  </Button>
                </div>
              </Field>
              <div className="hidden sm:col-span-3 sm:block" />

              <Field id="street" label="Rua" error={fe.street} className="sm:col-span-4">
                <Input id="street" name="street" className="field-luxe" value={addr.street} onChange={(e) => setAddr((a) => ({ ...a, street: e.target.value }))} autoComplete="off" aria-invalid={!!fe.street} />
              </Field>
              <Field id="streetNumber" label="Número" error={fe.streetNumber} className="sm:col-span-2">
                <Input id="streetNumber" name="streetNumber" ref={numberRef} className="field-luxe" defaultValue={val("streetNumber")} autoComplete="off" aria-invalid={!!fe.streetNumber} />
              </Field>
              <Field id="complement" label="Complemento" error={fe.complement} className="sm:col-span-3">
                <Input id="complement" name="complement" className="field-luxe" defaultValue={val("complement")} placeholder="Loja, sala, andar..." autoComplete="off" aria-invalid={!!fe.complement} />
              </Field>
              <Field id="neighborhood" label="Bairro" error={fe.neighborhood} className="sm:col-span-3">
                <Input id="neighborhood" name="neighborhood" className="field-luxe" value={addr.neighborhood} onChange={(e) => setAddr((a) => ({ ...a, neighborhood: e.target.value }))} autoComplete="off" aria-invalid={!!fe.neighborhood} />
              </Field>
              <Field id="city" label="Cidade" error={fe.city} className="sm:col-span-4">
                <Input id="city" name="city" className="field-luxe" value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} autoComplete="off" aria-invalid={!!fe.city} />
              </Field>
              <Field id="state" label="UF" error={fe.state} className="sm:col-span-2">
                <Input id="state" name="state" maxLength={2} className="field-luxe uppercase" value={addr.state} onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value }))} autoComplete="off" aria-invalid={!!fe.state} />
              </Field>
            </div>
          </FormSection>
        </div>

        {/* ---------- Funcionamento ---------- */}
        <div {...panel("funcionamento")}>
          <FormSection icon={Clock} title="Horário de funcionamento" description="Dias e horários em que a barbearia abre.">
            <HoursFields
              defaultValue={defaults.openingHours}
              errors={fe}
              legend="Dias da semana"
              hint="Deixe os horários em branco para não informar o dia."
            />
          </FormSection>

          <FormSection
            icon={CalendarClock}
            title="Agenda"
            description="Tempo de cada linha da agenda: é a menor fatia de horário que dá para marcar."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="slot" label="Cada linha da agenda tem" error={fe.slotMinutes}>
                <Select
                  id="slot"
                  value={slot}
                  onValueChange={setSlot}
                  options={SLOT_SELECT}
                  invalid={!!fe.slotMinutes}
                />
              </Field>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden="true" />
              {misaligned > 0 ? (
                <span>
                  {misaligned === 1 ? "1 serviço ativo tem duração que não é" : `${misaligned} serviços ativos têm duração que não é`}{" "}
                  múltipla de {slotLabel(Number(slot)).replace("minutos", "min")}. A agenda reserva o tempo arredondado para
                  cima (por exemplo, 45 min ocupam {Math.ceil(45 / Number(slot))}{" "}
                  {Math.ceil(45 / Number(slot)) === 1 ? "linha" : "linhas"} de {Number(slot)} min).
                </span>
              ) : (
                <span>Todos os serviços ativos fecham certinho com essa linha da agenda.</span>
              )}
            </p>
          </FormSection>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="luxe" size="lg" className="w-full sm:w-auto" disabled={pending || uploading}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {pending ? "Salvando…" : "Salvar configurações"}
            {pending ? null : (
              <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
