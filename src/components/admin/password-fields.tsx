"use client";

import { Check, Copy, Wand2 } from "lucide-react";
import { useId, useState } from "react";
import { FieldError } from "@/components/auth/form-alert";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const LOWER = "abcdefghijkmnopqrstuvwxyz"; // sem "l" (confunde com 1/I)
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem "I" e "O"
const DIGITS = "23456789"; // sem 0/1
const SYMBOLS = "!@#$%&*?";

/** Sorteio sem viés usando crypto (nunca Math.random para senha). */
function pick(chars: string) {
  const limit = Math.floor(0x1_0000_0000 / chars.length) * chars.length;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return chars[buf[0] % chars.length];
}

/** Senha forte que sempre cumpre a política (min/mai/número/símbolo, 16 chars). */
function generatePassword(length = 16) {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  // embaralha (Fisher-Yates com sorteio seguro)
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Campos "Senha" + "Confirmar senha" para o admin definir a senha de uma conta.
 * Os nomes (`password`, `confirm`) são lidos pelas Server Actions.
 */
export function PasswordFields({
  errors = {},
  idPrefix,
}: {
  errors?: Record<string, string>;
  idPrefix?: string;
}) {
  const auto = useId();
  const id = idPrefix ?? auto;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [copied, setCopied] = useState(false);

  function generate() {
    const p = generatePassword();
    setPassword(p);
    setConfirm(p);
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência: use o olho para ver e anotar.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-password`}>Senha</Label>
          <PasswordInput
            id={`${id}-password`}
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
          />
          <FieldError id={`${id}-password-error`} message={errors.password} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-confirm`}>Confirmar senha</Label>
          <PasswordInput
            id={`${id}-confirm`}
            name="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={!!errors.confirm}
          />
          <FieldError id={`${id}-confirm-error`} message={errors.confirm} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={generate}>
          <Wand2 />
          Gerar senha forte
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copy}
          disabled={!password}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copiada" : "Copiar senha"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Mínimo de 10 caracteres, com maiúscula, minúscula, número e símbolo. Use o olho para
          conferir.
        </span>
      </div>
    </div>
  );
}
