"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import {
  ArrowRight,
  AtSign,
  BriefcaseBusiness,
  Clock,
  ConciergeBell,
  Crown,
  HandHelping,
  IdCard,
  KeyRound,
  Loader2,
  MapPin,
  Percent,
  Scissors,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { AgendaDateField } from "@/components/agenda/mini-calendar";
import { FormAlert } from "@/components/auth/form-alert";
import { HoursFields } from "@/components/admin/hours-fields";
import { PasswordFields } from "@/components/admin/password-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select, type SelectOption } from "@/components/ui/select";
import {
  createBarberAction,
  lookupCepAction,
  updateBarberAction,
} from "@/app/u/[slug]/profissionais/actions";
import { hoursFromValues } from "@/lib/barbers/form";
import { initialBarberState } from "@/lib/barbers/types";
import type { AssignableService } from "@/lib/services/types";
import { emailProblem } from "@/lib/validation/auth";
import { JOB_TITLES, cnpjProblem, maskCnpj, maskPhone, onlyDigits, phoneProblem } from "@/lib/validation/barber";
import { Field, FormSection } from "./form-parts";
import { BarberServicePicker } from "./barber-service-picker";
import { PhotoUploader } from "./photo-uploader";
import { TabList, type TabDef } from "./tab-list";

/** Valores iniciais do formulário (strings, como vêm de um <form>). */
export type BarberDefaults = {
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string;
  phone: string;
  birthDate: string;
  cnpj: string;
  cep: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  /** O que vale de comissão para ele hoje (texto pronto, só leitura). */
  commissionServicesLabel: string;
  commissionProductsLabel: string;
  workHours: unknown;
  photoPath: string;
  photoUrl: string | null;
  /** Serviços que o profissional já faz -> duração própria em minutos ("" = padrão). */
  serviceMinutes: Record<string, string>;
};

export const EMPTY_DEFAULTS: BarberDefaults = {
  firstName: "",
  lastName: "",
  displayName: "",
  jobTitle: "barbeiro",
  phone: "",
  birthDate: "",
  cnpj: "",
  cep: "",
  street: "",
  streetNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  commissionServicesLabel: "Tabela da rede",
  commissionProductsLabel: "Percentual da rede",
  workHours: null,
  photoPath: "",
  photoUrl: null,
  serviceMinutes: {},
};

type TabId = "dados" | "acesso" | "horarios" | "servicos" | "comissoes";

const TABS: TabDef<TabId>[] = [
  { id: "dados", label: "Dados pessoais", icon: UserRound },
  { id: "acesso", label: "Acesso", icon: KeyRound },
  { id: "horarios", label: "Horários", icon: Clock },
  { id: "servicos", label: "Serviços", icon: Scissors },
  { id: "comissoes", label: "Comissões", icon: Percent },
];

/** Em qual aba mora cada campo (para abrir a aba certa quando há erro). */
function tabOf(field: string): TabId {
  if (field.startsWith("hours_")) return "horarios";
  if (field === "email" || field === "password" || field === "confirm") return "acesso";
  return "dados";
}

type Props = {
  slug: string;
  unitId: string;
  barberId: string;
  defaults: BarberDefaults;
  /** Serviços ativos da unidade (para escolher o que o profissional faz). */
  services: AssignableService[];
  mode: "create" | "edit";
  /** Edição: conteúdo da aba "Acesso" (senha e status), renderizado no servidor. */
  editAccess?: React.ReactNode;
};

const ICON = "size-4";

/** Funções com ícone de linha para a lista de opções. */
const JOB_ICONS: Record<string, LucideIcon> = {
  barbeiro: Scissors,
  recepcionista: ConciergeBell,
  gerente: BriefcaseBusiness,
  lider: Crown,
  auxiliar: HandHelping,
};
const JOB_OPTIONS: SelectOption[] = JOB_TITLES.map((j) => ({ value: j.value, label: j.label, icon: JOB_ICONS[j.value] }));

/** "01310100" -> "01310-100" (máscara enquanto digita). */
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

export function BarberForm({ slug, unitId, barberId, defaults, services, mode, editAccess }: Props) {
  const editing = mode === "edit";
  const [state, formAction, pending] = useActionState(
    editing ? updateBarberAction.bind(null, slug, barberId) : createBarberAction.bind(null, slug),
    initialBarberState,
  );
  const [uploading, setUploading] = useState(false);
  const [serviceMinutes, setServiceMinutes] = useState(defaults.serviceMinutes);
  // Aviso de "salvo": fecha sozinho; guardamos qual resposta já foi fechada.
  const [closedNotice, setClosedNotice] = useState<unknown>(null);
  const [tab, setTab] = useState<TabId>("dados");

  const fe = state.fieldErrors ?? {};
  // Depois de um erro o React 19 limpa campos não controlados: devolvemos o que foi digitado.
  const val = (k: string) => state.values?.[k] ?? String((defaults as Record<string, unknown>)[k] ?? "");
  const hours = state.values ? hoursFromValues(state.values) : defaults.workHours;
  const hoursKey = state.values ? "typed" : "saved";
  const base = `/u/${slug}/profissionais`;

  // Abas com erro ganham um ponto; a primeira delas abre sozinha a cada resposta com erro.
  const errorTabs = new Set(Object.keys(fe).map(tabOf));
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const first = TABS.find((t) => errorTabs.has(t.id));
    if (state.status === "error" && first) setTab(first.id);
  }

  const [jobTitle, setJobTitle] = useState(val("jobTitle") || "barbeiro");
  const [birth, setBirth] = useState(val("birthDate"));
  const todaySP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  // Telefone e CNPJ: máscara enquanto digita e aviso de erro ao sair do campo.
  const [masked, setMasked] = useState({
    phone: maskPhone(val("phone")),
    cnpj: maskCnpj(val("cnpj")),
    email: val("email"),
  });
  type Checked = "phone" | "cnpj" | "email";
  const [blurErr, setBlurErr] = useState<Partial<Record<Checked, string>>>({});
  const typed = (k: Checked, v: string) => {
    setMasked((m) => ({ ...m, [k]: v }));
    setBlurErr((b) => ({ ...b, [k]: "" })); // "" = campo mexido: some o erro antigo
  };
  const checked = (k: Checked, check: (v: string) => string | null) =>
    setBlurErr((b) => ({ ...b, [k]: check(masked[k]) ?? "" }));
  // O erro do servidor vale até a pessoa mexer no campo de novo.
  const [serverErrSeen, setServerErrSeen] = useState(state);
  if (state !== serverErrSeen) {
    setServerErrSeen(state);
    setBlurErr({});
  }
  const phoneErr = blurErr.phone ?? fe.phone;
  const cnpjErr = blurErr.cnpj ?? fe.cnpj;
  const emailErr = blurErr.email ?? fe.email;

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
    const r = await lookupCepAction(slug, value);
    setCepBusy(false);
    if (!r.ok) return setCepMsg(r.message);
    setAddr((a) => ({ ...a, ...r.address }));
    numberRef.current?.focus();
  }

  const panel = (id: TabId) => ({
    role: "tabpanel" as const,
    id: `barber-panel-${id}`,
    "aria-labelledby": `barber-tab-${id}`,
    hidden: tab !== id,
    className: "flex flex-col gap-5",
  });

  const showFooter = !editing || tab !== "acesso";

  return (
    <div className="flex flex-col gap-6">
      <div className="reveal" style={{ "--d": "60ms" } as React.CSSProperties}>
        <TabList
          tabs={TABS}
          active={tab}
          onChange={setTab}
          errorTabs={errorTabs}
          idPrefix="barber"
          label="Etapas do cadastro do profissional"
        />
      </div>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        {!editing ? <input type="hidden" name="id" value={barberId} /> : null}
        {Object.entries(serviceMinutes).map(([id, minutes]) => (
          <span key={id} hidden>
            <input type="hidden" name="serviceIds" value={id} />
            <input type="hidden" name={`serviceMinutes_${id}`} value={minutes} />
          </span>
        ))}

        {state.status === "error" && state.message ? (
          <FormAlert key={state.message} tone="error">
            {state.message}
          </FormAlert>
        ) : null}
        {state.status === "success" && editing && closedNotice !== state ? (
          <Notice title="Alterações salvas" onClose={() => setClosedNotice(state)}>
            Os dados do profissional foram atualizados.
          </Notice>
        ) : null}

        {/* ---------- Dados pessoais ---------- */}
        <div {...panel("dados")}>
          <FormSection icon={UserRound} title="Dados pessoais" description="Foto e identificação do profissional.">
            <div className="flex flex-col gap-6">
              <PhotoUploader
                unitId={unitId}
                barberId={barberId}
                name={val("displayName") || val("firstName")}
                initialPath={state.values?.photoPath ?? defaults.photoPath}
                initialUrl={defaults.photoUrl}
                onBusyChange={setUploading}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="firstName" label="Nome" error={fe.firstName}>
                  <Input id="firstName" name="firstName" className="field-luxe" defaultValue={val("firstName")} autoComplete="off" aria-invalid={!!fe.firstName} />
                </Field>
                <Field id="lastName" label="Sobrenome" error={fe.lastName}>
                  <Input id="lastName" name="lastName" className="field-luxe" defaultValue={val("lastName")} autoComplete="off" aria-invalid={!!fe.lastName} />
                </Field>
                <Field id="displayName" label="Apelido na agenda" error={fe.displayName} hint="Nome curto que a recepção e os clientes veem.">
                  <Input id="displayName" name="displayName" className="field-luxe" defaultValue={val("displayName")} placeholder="Ex.: Juninho" autoComplete="off" aria-invalid={!!fe.displayName} />
                </Field>
                <Field id="jobTitle" label="Função" error={fe.jobTitle}>
                  <Select
                    id="jobTitle"
                    name="jobTitle"
                    value={jobTitle}
                    onValueChange={setJobTitle}
                    options={JOB_OPTIONS}
                    invalid={!!fe.jobTitle}
                  />
                </Field>
                <Field id="birthDate" label="Data de nascimento" error={fe.birthDate}>
                  <AgendaDateField id="birthDate" name="birthDate" value={birth} today={todaySP} onChange={setBirth} invalid={!!fe.birthDate} />
                </Field>
                <Field id="phone" label="Telefone" error={phoneErr}>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    className="field-luxe"
                    value={masked.phone}
                    placeholder="(11) 91234-5678"
                    autoComplete="off"
                    aria-invalid={!!phoneErr}
                    onChange={(e) => typed("phone", maskPhone(e.target.value))}
                    onBlur={() => checked("phone", phoneProblem)}
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          <FormSection icon={MapPin} title="Endereço" description="Digite o CEP e o endereço é preenchido sozinho.">
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
                <Input id="complement" name="complement" className="field-luxe" defaultValue={val("complement")} placeholder="Apto, bloco..." autoComplete="off" aria-invalid={!!fe.complement} />
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

          <FormSection icon={IdCard} title="Documento e redes sociais" description="Opcionais. Redes aceitam @usuario ou o link do perfil.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="cnpj" label="CNPJ" error={cnpjErr}>
                <Input
                  id="cnpj"
                  name="cnpj"
                  className="field-luxe uppercase"
                  value={masked.cnpj}
                  placeholder="00.000.000/0000-00"
                  autoComplete="off"
                  aria-invalid={!!cnpjErr}
                  onChange={(e) => typed("cnpj", maskCnpj(e.target.value))}
                  onBlur={() => checked("cnpj", cnpjProblem)}
                />
              </Field>
              <span className="hidden sm:block" />
              <Field id="instagram" label="Instagram" error={fe.instagram}>
                <IconInput icon={<AtSign className={ICON} />} id="instagram" name="instagram" defaultValue={val("instagram")} placeholder="usuario" autoComplete="off" aria-invalid={!!fe.instagram} />
              </Field>
              <Field id="facebook" label="Facebook" error={fe.facebook}>
                <IconInput icon={<AtSign className={ICON} />} id="facebook" name="facebook" defaultValue={val("facebook")} placeholder="usuario" autoComplete="off" aria-invalid={!!fe.facebook} />
              </Field>
              <Field id="tiktok" label="TikTok" error={fe.tiktok}>
                <IconInput icon={<AtSign className={ICON} />} id="tiktok" name="tiktok" defaultValue={val("tiktok")} placeholder="usuario" autoComplete="off" aria-invalid={!!fe.tiktok} />
              </Field>
            </div>
          </FormSection>
        </div>

        {/* ---------- Acesso (só no cadastro; na edição fica fora do formulário) ---------- */}
        {!editing ? (
          <div {...panel("acesso")}>
            <FormSection
              icon={KeyRound}
              title="Acesso ao sistema"
              description="O profissional entra com este e-mail e a senha que você definir. Depois você pode alterá-la."
            >
              <div className="flex flex-col gap-5">
                <Field id="email" label="E-mail de login" error={emailErr}>
                  <IconInput
                    icon={<AtSign className={ICON} />}
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    value={masked.email}
                    placeholder="profissional@exemplo.com"
                    autoComplete="off"
                    aria-invalid={!!emailErr}
                    onChange={(e) => typed("email", e.target.value)}
                    onBlur={() => {
                      // Tira espaços e deixa minúsculo (é assim que o login é gravado).
                      const clean = masked.email.trim().toLowerCase();
                      if (clean !== masked.email) setMasked((m) => ({ ...m, email: clean }));
                      setBlurErr((b) => ({ ...b, email: emailProblem(clean) ?? "" }));
                    }}
                  />
                </Field>
                <PasswordFields idPrefix="barber" errors={fe} />
              </div>
            </FormSection>
          </div>
        ) : null}

        {/* ---------- Horários ---------- */}
        <div {...panel("horarios")}>
          <FormSection icon={Clock} title="Dias e horários" description="Quando o profissional atende.">
            <HoursFields
              key={hoursKey}
              defaultValue={hours}
              errors={fe}
              legend="Quando trabalha"
              hint="Informe entrada, saída para o almoço, volta e saída. O intervalo entre a saída e a volta é o almoço (deixe em branco se não houver). Ligue Folga nos dias em que não trabalha."
              closedLabel="Folga"
              withBreak
            />
          </FormSection>
        </div>

        {/* ---------- Serviços ---------- */}
        <div {...panel("servicos")}>
          <FormSection icon={Scissors} title="Serviços que realiza" description="Marque os serviços e ajuste o tempo, se for diferente do padrão.">
            <BarberServicePicker slug={slug} services={services} selected={serviceMinutes} onChange={setServiceMinutes} />
          </FormSection>
        </div>

        {/* ---------- Comissões (só leitura: quem define é o admin da rede) ---------- */}
        <div {...panel("comissoes")}>
          <FormSection icon={Percent} title="Comissões" description="Quem define as comissões é o admin da rede, no painel dele.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-black/20 px-4 py-3.5">
                <p className="label-caps text-[0.62rem]">Sobre serviços</p>
                <p className="mt-1.5 font-heading text-base font-semibold uppercase tracking-wide text-cream">
                  {defaults.commissionServicesLabel}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-black/20 px-4 py-3.5">
                <p className="label-caps text-[0.62rem]">Sobre produtos</p>
                <p className="mt-1.5 font-heading text-base font-semibold uppercase tracking-wide text-cream">
                  {defaults.commissionProductsLabel}
                </p>
              </div>
            </div>
          </FormSection>
        </div>

        {showFooter ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="luxe" size="lg" className="w-full sm:w-auto" disabled={pending || uploading}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar profissional"}
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

      {/* Edição: aba Acesso fora do <form> (tem formulários próprios); fica montada para não perder o que foi digitado. */}
      {editing ? (
        <div role="tabpanel" id="barber-panel-acesso" aria-labelledby="barber-tab-acesso" hidden={tab !== "acesso"} className="flex flex-col gap-5">
          {editAccess}
        </div>
      ) : null}
    </div>
  );
}
