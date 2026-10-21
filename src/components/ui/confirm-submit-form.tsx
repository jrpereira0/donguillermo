"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Ação destrutiva com confirmação inline: o primeiro clique arma a
 * confirmação (título + o que acontece), e só o botão de confirmar envia
 * o formulário. "Voltar" desarma sem fazer nada.
 */
export function ConfirmSubmitForm({
  action,
  label,
  confirmLabel,
  title,
  description,
  className,
}: {
  action: () => Promise<void>;
  label: React.ReactNode;
  confirmLabel: string;
  title: string;
  description?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button type="button" variant="outline" size="sm" className={className} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }

  return (
    <form
      action={action}
      className="flex max-w-md flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/[0.06] px-4 py-3"
      aria-label={title}
    >
      <p className="text-sm font-medium text-cream">{title}</p>
      {description ? <p className="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="bg-destructive text-white hover:bg-destructive/85">
          {confirmLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setArmed(false)}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
