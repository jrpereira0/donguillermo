"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUnitAction } from "@/app/admin/actions";
import { initialAdminState } from "@/lib/admin/state";
import { slugify } from "@/lib/validation/unit";
import { HoursFields } from "./hours-fields";
import { PasswordFields } from "./password-fields";

/**
 * Cria a unidade e o acesso da recepção. Depois de criada, os dados (marca, contato,
 * endereço, horário, agenda) são editados em Configurações da unidade.
 */
export function UnitForm() {
  const [state, formAction, pending] = useActionState(createUnitAction, initialAdminState);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const fe = state.fieldErrors ?? {};

  // Depois de criar, mostra o resultado.
  if (state.createdSlug) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </FormAlert>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/unidades/${state.createdSlug}`}
            className={buttonVariants({ size: "lg" })}
          >
            Abrir a unidade
          </Link>
          <Link
            href={`/u/${state.createdSlug}/configuracoes`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Completar as configurações
          </Link>
          <Link href="/admin" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Voltar à lista
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state.status === "error" && state.message ? (
        <FormAlert tone="error">{state.message}</FormAlert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome da unidade</Label>
        <Input
          id="name"
          name="name"
          required
          value={name}
          placeholder="Ex.: São Bernardo - Shopping Metrópole"
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          aria-invalid={!!fe.name}
          aria-describedby={fe.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={fe.name} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Endereço na web (slug)</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">/u/</span>
          <Input
            id="slug"
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            aria-invalid={!!fe.slug}
            aria-describedby="slug-help slug-error"
            className="font-mono"
          />
        </div>
        <p id="slug-help" className="text-xs text-muted-foreground">
          Gerado a partir do nome. Só letras minúsculas, números e hífens. Não poderá ser alterado depois.
        </p>
        <FieldError id="slug-error" message={fe.slug} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="address">Endereço</Label>
          <Input id="address" name="address" autoComplete="off" aria-invalid={!!fe.address} />
          <FieldError id="address-error" message={fe.address} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" name="phone" type="tel" autoComplete="off" aria-invalid={!!fe.phone} />
          <FieldError id="phone-error" message={fe.phone} />
        </div>
      </div>

      <HoursFields errors={fe} />

      <fieldset className="flex flex-col gap-5 rounded-lg border border-border p-4">
        <legend className="label-caps px-2">Acesso da recepção</legend>
        <p className="text-sm text-muted-foreground">
          A conta da recepção é criada junto com a unidade, com a senha que você definir aqui (você poderá alterá-la depois na página da unidade).
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="receptionEmail">E-mail da recepção</Label>
            <Input
              id="receptionEmail"
              name="receptionEmail"
              type="email"
              inputMode="email"
              required
              placeholder="recepcao@exemplo.com"
              aria-invalid={!!fe.receptionEmail}
            />
            <FieldError id="receptionEmail-error" message={fe.receptionEmail} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="receptionName">Nome (opcional)</Label>
            <Input id="receptionName" name="receptionName" autoComplete="off" />
            <FieldError id="receptionName-error" message={fe.receptionName} />
          </div>
        </div>
        <PasswordFields idPrefix="unit" errors={fe} />
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Salvando…" : "Criar unidade"}
        </Button>
        <Link href="/admin" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
