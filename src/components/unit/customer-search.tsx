"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";

/**
 * Busca de clientes: a pesquisa roda no servidor (a rede pode ter milhares de clientes),
 * então digitar atualiza o `?q=` da página depois de uma pequena pausa.
 */
export function CustomerSearch({ slug, initial }: { slug: string; initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();

  useEffect(() => {
    const q = value.trim();
    if (q === initial.trim()) return;
    const t = setTimeout(() => {
      const href = `/u/${slug}/clientes${q ? `?q=${encodeURIComponent(q)}` : ""}`;
      start(() => router.replace(href));
    }, 350);
    return () => clearTimeout(t);
  }, [value, initial, slug, router]);

  return (
    <div className="group relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por nome, telefone, CPF ou e-mail"
        aria-label="Buscar cliente"
        autoComplete="off"
        maxLength={60}
        className="field-luxe h-11 w-full min-w-0 rounded-lg border border-input pl-11 pr-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  );
}
