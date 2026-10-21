"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AtSign,
  History,
  IdCard,
  Layers,
  Loader2,
  MapPin,
  Megaphone,
  NotebookPen,
  Phone,
  Search,
  Settings2,
  UserRound,
} from "lucide-react";
import { AgendaDateField } from "@/components/agenda/mini-calendar";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createCustomerAction,
  lookupCustomerCepAction,
  updateCustomerAction,
} from "@/app/u/[slug]/clientes/actions";
import { CUSTOMER_PHOTO_BUCKET, initialCustomerState } from "@/lib/customers/types";
import { emailProblem } from "@/lib/validation/auth";
import { maskPhone, onlyDigits, phoneProblem } from "@/lib/validation/barber";
import { REFERRAL_SOURCES, cpfProblem, maskCpf } from "@/lib/validation/customer";
import { Field, FormSection } from "./form-parts";
import { PhotoUploader } from "./photo-uploader";
import { TabList, type TabDef } from "./tab-list";

/** Valores iniciais do formulário (strings, como vêm de um <form>). */
export type CustomerDefaults = {
  fullName: string;
  phone: string;
  email: string;
  birthDate: string;
  cpf: string;
  cep: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  referralSource: string;
  marketingConsent: boolean;
  photoPath: string;
  photoUrl: string | null;
};

export const EMPTY_CUSTOMER: CustomerDefaults = {
  fullName: "",
  phone: "",
  email: "",
  birthDate: "",
  cpf: "",
  cep: "",
  street: "",
  streetNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  referralSource: "",
  marketingConsent: false,
  photoPath: "",
  photoUrl: null,
};

type TabId = "dados" | "observacoes" | "pacotes" | "historico" | "situacao";

const CREATE_TABS: TabDef<TabId>[] = [
  { id: "dados", label: "Dados pessoais", icon: UserRound },
];
const EDIT_TABS: TabDef<TabId>[] = [
  ...CREATE_TABS,
  { id: "observacoes", label: "Observações", icon: NotebookPen },
  { id: "pacotes", label: "Pacotes", icon: Layers },
  { id: "historico", label: "Histórico", icon: History },
  { id: "situacao", label: "Situação", icon: Settings2 },
];

const ICON = "size-4";
const NONE = "__none";

const REFERRAL_OPTIONS: SelectOption[] = [
  { value: NONE, label: "Não informado" },
  ...REFERRAL_SOURCES.map((r) => ({ value: r.value, label: r.label })),
];

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

type Props = {
  slug: string;
  customerId: string;
  defaults: CustomerDefaults;
  mode: "create" | "edit";
  /** Edição: conteúdo da aba "Observações" (lista, renderizada no servidor). */
  editNotes?: React.ReactNode;
  /** Edição: conteúdo da aba "Histórico" (renderizado no servidor). */
  editHistory?: React.ReactNode;
  /** Edição: conteúdo da aba "Pacotes" (renderizado no servidor). */
  editPackages?: React.ReactNode;
  /** Edição: conteúdo da aba "Situação" (renderizado no servidor). */
  editStatus?: React.ReactNode;
};

export function CustomerForm({ slug, customerId, defaults, mode, editNotes, editHistory, editPackages, editStatus }: Props) {
  const editing = mode === "edit";
  const [state, formAction, pending] = useActionState(
    editing ? updateCustomerAction.bind(null, slug, customerId) : createCustomerAction.bind(null, slug),
    initialCustomerState,
  );
  const [uploading, setUploading] = useState(false);
  const [closedNotice, setClosedNotice] = useState<unknown>(null);
  const [tab, setTab] = useState<TabId>("dados");
  const tabs = editing ? EDIT_TABS : CREATE_TABS;

  const fe = state.fieldErrors ?? {};

  // Com erro ao salvar, a tela vai até o primeiro campo errado e foca nele
  // (na ordem visual do formulário), em vez de deixar a recepção procurando.
  useEffect(() => {
    if (state.status !== "error") return;
    const ids = ["fullName", "phone", "email", "birthDate", "cpf", "cep", "street", "streetNumber", "complement", "neighborhood", "city", "state"];
    const firstId = ids.find((id) => fe[id as keyof typeof fe]);
    if (!firstId) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(firstId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  // Depois de um erro o React 19 limpa campos não controlados: devolvemos o que foi digitado.
  const val = (k: keyof CustomerDefaults) => state.values?.[k] ?? String(defaults[k] ?? "");
  const base = `/u/${slug}/clientes`;

  const errorTabs = new Set<TabId>(Object.keys(fe).length ? ["dados"] : []);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const first = tabs.find((t) => errorTabs.has(t.id));
    if (state.status === "error" && first) setTab(first.id);
  }

  // Campos com máscara e/ou aviso ao sair do campo.
  const [masked, setMasked] = useState({
    phone: maskPhone(val("phone")),
    cpf: maskCpf(val("cpf")),
    email: val("email"),
  });
  type Checked = "phone" | "cpf" | "email";
  const [blurErr, setBlurErr] = useState<Partial<Record<Checked, string>>>({});
  const typed = (k: Checked, v: string) => {
    setMasked((m) => ({ ...m, [k]: v }));
    setBlurErr((b) => ({ ...b, [k]: "" })); // "" = campo mexido: some o erro antigo
  };
  const checked = (k: Checked, check: (v: string) => string | null) =>
    setBlurErr((b) => ({ ...b, [k]: check(masked[k]) ?? "" }));
  const [serverErrSeen, setServerErrSeen] = useState(state);
  if (state !== serverErrSeen) {
    setServerErrSeen(state);
    setBlurErr({});
  }
  const phoneErr = blurErr.phone ?? fe.phone;
  const cpfErr = blurErr.cpf ?? fe.cpf;
  const emailErr = blurErr.email ?? fe.email;

  // Origem e consentimento: controlados (o Select vira campo oculto e o Switch um checkbox no envio).
  const [referral, setReferral] = useState(val("referralSource") || NONE);
  const [birth, setBirth] = useState(val("birthDate"));
  const todaySP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [consent, setConsent] = useState(
    state.values ? state.values.marketingConsent === "on" : defaults.marketingConsent,
  );

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
    const r = await lookupCustomerCepAction(slug, value);
    setCepBusy(false);
    if (!r.ok) return setCepMsg(r.message);
    setAddr((a) => ({ ...a, ...r.address }));
    numberRef.current?.focus();
  }

  const panel = (id: TabId) => ({
    role: "tabpanel" as const,
    id: `customer-panel-${id}`,
    "aria-labelledby": `customer-tab-${id}`,
    hidden: tab !== id,
    className: "flex flex-col gap-5",
  });

  const showFooter = tab === "dados";

  return (
    <div className="flex flex-col gap-6">
      {/* Cadastro novo tem uma etapa só: as abas aparecem na edição. */}
      <div className="reveal" style={{ "--d": "60ms" } as React.CSSProperties} hidden={!editing}>
        <TabList
          tabs={tabs}
          active={tab}
          onChange={setTab}
          errorTabs={errorTabs}
          idPrefix="customer"
          label="Etapas do cadastro do cliente"
        />
      </div>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        {!editing ? <input type="hidden" name="id" value={customerId} /> : null}
        <input type="hidden" name="referralSource" value={referral === NONE ? "" : referral} />

        {state.status === "error" && state.message ? (
          <FormAlert key={state.message} tone="error">
            {state.message}
          </FormAlert>
        ) : null}
        {state.status === "success" && editing && closedNotice !== state ? (
          <Notice title="Alterações salvas" onClose={() => setClosedNotice(state)}>
            Os dados do cliente foram atualizados.
          </Notice>
        ) : null}

        {/* ---------- Dados pessoais ---------- */}
        <div {...panel("dados")}>
          <FormSection icon={UserRound} title="Dados pessoais" description="Foto e identificação do cliente.">
            <div className="flex flex-col gap-6">
              <PhotoUploader
                unitId=""
                barberId={customerId}
                name={val("fullName")}
                bucket={CUSTOMER_PHOTO_BUCKET}
                buildPath={(ext) => `${customerId}.${ext}`}
                initialPath={state.values?.photoPath ?? defaults.photoPath}
                initialUrl={defaults.photoUrl}
                onBusyChange={setUploading}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="fullName" label="Nome completo" error={fe.fullName} className="sm:col-span-2">
                  <Input id="fullName" name="fullName" className="field-luxe" defaultValue={val("fullName")} autoComplete="off" aria-invalid={!!fe.fullName} />
                </Field>
                <Field id="phone" label="Telefone (WhatsApp)" error={phoneErr}>
                  <IconInput
                    icon={<Phone className={ICON} />}
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    value={masked.phone}
                    placeholder="(11) 91234-5678"
                    autoComplete="off"
                    aria-invalid={!!phoneErr}
                    onChange={(e) => typed("phone", maskPhone(e.target.value))}
                    onBlur={() =>
                      checked("phone", (v) => (onlyDigits(v) === "" ? "Informe o telefone." : phoneProblem(v)))
                    }
                  />
                </Field>
                <Field id="email" label="E-mail" error={emailErr}>
                  <IconInput
                    icon={<AtSign className={ICON} />}
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    value={masked.email}
                    placeholder="cliente@exemplo.com"
                    autoComplete="off"
                    aria-invalid={!!emailErr}
                    onChange={(e) => typed("email", e.target.value)}
                    onBlur={() => {
                      const clean = masked.email.trim().toLowerCase();
                      if (clean !== masked.email) setMasked((m) => ({ ...m, email: clean }));
                      setBlurErr((b) => ({ ...b, email: clean === "" ? "" : (emailProblem(clean) ?? "") }));
                    }}
                  />
                </Field>
                <Field id="birthDate" label="Data de nascimento" error={fe.birthDate}>
                  <AgendaDateField id="birthDate" name="birthDate" value={birth} today={todaySP} onChange={setBirth} invalid={!!fe.birthDate} />
                </Field>
                <Field id="cpf" label="CPF" error={cpfErr} hint="Opcional. Não pode repetir na rede.">
                  <IconInput
                    icon={<IdCard className={ICON} />}
                    id="cpf"
                    name="cpf"
                    inputMode="numeric"
                    value={masked.cpf}
                    placeholder="000.000.000-00"
                    autoComplete="off"
                    aria-invalid={!!cpfErr}
                    onChange={(e) => typed("cpf", maskCpf(e.target.value))}
                    onBlur={() => checked("cpf", cpfProblem)}
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          <FormSection icon={MapPin} title="Endereço" description="Opcional. Digite o CEP e o endereço é preenchido sozinho.">
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

          <FormSection icon={Megaphone} title="Como nos conheceu" description="Opcional. Ajuda a saber de onde vêm os clientes.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="referral" label="Como conheceu a barbearia" error={fe.referralSource}>
                <Select
                  id="referral"
                  value={referral}
                  onValueChange={setReferral}
                  options={REFERRAL_OPTIONS}
                  invalid={!!fe.referralSource}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection icon={Megaphone} title="Comunicação" description="Consentimento do cliente para receber promoções e lembretes.">
            <Switch name="marketingConsent" checked={consent} onChange={(e) => setConsent(e.target.checked)}>
              Aceita receber novidades e promoções por WhatsApp e e-mail
            </Switch>
            <p className="mt-3 text-xs text-muted-foreground">
              Registramos a data em que o consentimento foi dado (exigência da LGPD).
            </p>
          </FormSection>
        </div>

        {showFooter ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="luxe" size="lg" className="w-full sm:w-auto" disabled={pending || uploading}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar cliente"}
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

      {/* Edição: Histórico e Situação ficam fora do <form> (não enviam nada); permanecem montados. */}
      {editing ? (
        <>
          <div role="tabpanel" id="customer-panel-observacoes" aria-labelledby="customer-tab-observacoes" hidden={tab !== "observacoes"} className="flex flex-col gap-5">
            {editNotes}
          </div>
          <div role="tabpanel" id="customer-panel-pacotes" aria-labelledby="customer-tab-pacotes" hidden={tab !== "pacotes"} className="flex flex-col gap-5">
            {editPackages}
          </div>
          <div role="tabpanel" id="customer-panel-historico" aria-labelledby="customer-tab-historico" hidden={tab !== "historico"} className="flex flex-col gap-5">
            {editHistory}
          </div>
          <div role="tabpanel" id="customer-panel-situacao" aria-labelledby="customer-tab-situacao" hidden={tab !== "situacao"} className="flex flex-col gap-5">
            {editStatus}
          </div>
        </>
      ) : null}
    </div>
  );
}
