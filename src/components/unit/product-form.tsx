"use client";

import Link from "next/link";
import { useState } from "react";
import { useActionState } from "react";
import { ArrowRight, ClipboardList, Loader2, Power, Wallet } from "lucide-react";
import { createProductAction, updateProductAction } from "@/app/u/[slug]/produtos/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { initialProductState } from "@/lib/products/types";
import { PRODUCT_CATEGORY_OPTIONS } from "./product-categories";
import { ProductIcon } from "./product-icon";
import { formatBRL, maskMoney, moneyToCents, priceProblem } from "@/lib/validation/service";
import { Field, FormSection } from "./form-parts";
import { TabList, type TabDef } from "./tab-list";

export type ProductDefaults = {
  name: string;
  category: string;
  description: string;
  price: string;
};

export const EMPTY_PRODUCT_DEFAULTS: ProductDefaults = {
  name: "",
  category: "cabelo",
  description: "",
  price: "",
};

type TabId = "dados" | "preco" | "situacao";

const CATEGORY_OPTIONS = PRODUCT_CATEGORY_OPTIONS;

function tabOf(field: string): TabId {
  return field === "price" ? "preco" : "dados";
}

export function ProductForm({
  slug,
  defaults,
  mode,
  productId,
  editStatus,
}: {
  slug: string;
  defaults: ProductDefaults;
  mode: "create" | "edit";
  productId?: string;
  editStatus?: React.ReactNode;
}) {
  const editing = mode === "edit";
  const [state, formAction, pending] = useActionState(
    editing ? updateProductAction.bind(null, slug, productId ?? "") : createProductAction.bind(null, slug),
    initialProductState,
  );
  const [tab, setTab] = useState<TabId>("dados");
  const [closedNotice, setClosedNotice] = useState<unknown>(null);

  const fe = state.fieldErrors ?? {};
  const val = (k: keyof ProductDefaults) => state.values?.[k] ?? defaults[k];
  const base = `/u/${slug}/produtos`;

  const tabs: TabDef<TabId>[] = [
    { id: "dados", label: "Dados do produto", icon: ClipboardList },
    { id: "preco", label: "Preço", icon: Wallet },
    ...(editing ? [{ id: "situacao" as const, label: "Situação", icon: Power }] : []),
  ];

  const errorTabs = new Set(Object.keys(fe).map(tabOf));
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const first = tabs.find((t) => errorTabs.has(t.id));
    if (state.status === "error" && first) setTab(first.id);
  }

  const [name, setName] = useState(val("name"));
  const [category, setCategory] = useState(val("category"));
  const [description, setDescription] = useState(val("description"));
  const [price, setPrice] = useState(maskMoney(val("price")));
  const [priceBlur, setPriceBlur] = useState<string | undefined>();
  const [errSeen, setErrSeen] = useState(state);
  if (state !== errSeen) {
    setErrSeen(state);
    setPriceBlur(undefined);
  }
  const priceErr = priceBlur ?? fe.price;
  const cents = moneyToCents(price);
  const showFooter = !editing || tab !== "situacao";

  const panel = (id: TabId) => ({
    role: "tabpanel" as const,
    id: `product-panel-${id}`,
    "aria-labelledby": `product-tab-${id}`,
    hidden: tab !== id,
    className: "flex flex-col gap-5",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="reveal" style={{ "--d": "60ms" } as React.CSSProperties}>
        <TabList tabs={tabs} active={tab} onChange={setTab} errorTabs={errorTabs} idPrefix="product" label="Etapas do cadastro do produto" />
      </div>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        {state.status === "error" && state.message ? <FormAlert tone="error">{state.message}</FormAlert> : null}
        {state.status === "success" && editing && closedNotice !== state ? (
          <Notice title="Alterações salvas" onClose={() => setClosedNotice(state)}>
            Os dados do produto foram atualizados.
          </Notice>
        ) : null}

        <div {...panel("dados")}>
          <FormSection icon={ClipboardList} title="Dados do produto" description="Como o produto aparece no caixa e na comanda.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="name" label="Nome do produto" error={fe.name} className="sm:col-span-2">
                <Input
                  id="name"
                  name="name"
                  className="field-luxe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Pomada modeladora"
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
                hint="Aparece para a recepção na hora de vender."
                className="sm:col-span-2"
              >
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  maxLength={300}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Fixação forte, brilho discreto, pote de 80 g."
                  aria-invalid={!!fe.description}
                />
                <span className="text-right text-xs text-muted-foreground">{description.length}/300</span>
              </Field>
            </div>
          </FormSection>
        </div>

        <div {...panel("preco")}>
          <FormSection icon={Wallet} title="Preço" description="Valor cobrado na comanda.">
            <div className="flex flex-col gap-6">
              <Field id="price" label="Preço" error={priceErr} hint="Use 0,00 para cortesia.">
                <div className="group relative max-w-xs">
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
              <div className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-[#0b0b0b]/40 px-4 py-3.5" aria-live="polite">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
                  <ProductIcon category={category} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-base font-semibold uppercase tracking-wide">
                    {name.trim() || "Nome do produto"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? "Outros"}
                  </p>
                </div>
                <p className="font-heading text-xl font-semibold text-gold">{cents === null ? "R$ --" : formatBRL(cents)}</p>
              </div>
            </div>
          </FormSection>
        </div>

        {showFooter ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="luxe" size="lg" className="w-full sm:w-auto" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar produto"}
              {pending ? null : <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />}
            </Button>
            <Link href={base} className={buttonVariants({ variant: "outline", size: "lg", className: "w-full sm:w-auto" })}>
              {editing ? "Voltar" : "Cancelar"}
            </Link>
          </div>
        ) : null}
      </form>

      {editing ? (
        <div role="tabpanel" id="product-panel-situacao" aria-labelledby="product-tab-situacao" hidden={tab !== "situacao"} className="flex flex-col gap-5">
          {editStatus}
        </div>
      ) : null}
    </div>
  );
}
