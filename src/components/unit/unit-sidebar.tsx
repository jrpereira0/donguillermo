"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  LogOut,
  Menu,
  Package,
  Scissors,
  Settings,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { OrnamentDivider } from "@/components/brand/ornament-divider";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import type { NavIcon, NavItem } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  agenda: CalendarDays,
  profissionais: Users,
  servicos: Scissors,
  produtos: Package,
  caixa: Wallet,
  configuracoes: Settings,
};

type Props = {
  items: NavItem[];
  unitName: string;
  email: string;
  logoSrc: string | null;
  brandName: string;
  /** Link de volta ao painel da rede (só para o administrador). */
  backHref?: string;
};

/** Menu lateral da unidade: fixo no desktop, gaveta no celular. */
export function UnitSidebar({ items, unitName, email, logoSrc, brandName, backHref }: Props) {
  const pathname = usePathname();
  // A gaveta guarda em qual página foi aberta: ao navegar ela fecha sozinha (sem effect).
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (v: boolean) => setOpenedAt(v ? pathname : null);

  // Fecha com Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedAt(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const panel = (
    <div className="flex h-full flex-col gap-6 px-4 py-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoSrc ? <img src={logoSrc} alt={brandName} className="h-16 w-auto" /> : null}
        <div>
          <p className="label-caps text-gold">Unidade</p>
          <p className="mt-1 font-heading text-sm font-semibold uppercase leading-tight tracking-wide">
            {unitName}
          </p>
        </div>
        <OrnamentDivider className="w-28" />
      </div>

      <nav aria-label="Menu da unidade" className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active}
              aria-current={active ? "page" : undefined}
              className="nav-luxe flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"
            >
              <Icon className="size-4 shrink-0 transition-colors" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {backHref ? (
          <Link
            href={backHref}
            className="nav-luxe flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" />
            Painel da rede
          </Link>
        ) : null}
        <p className="truncate px-3 text-xs text-muted-foreground" title={email}>
          {email}
        </p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="nav-luxe flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground"
          >
            <LogOut className="size-4 shrink-0" />
            Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Celular: barra superior com o botão do menu */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-[#141414]/95 px-4 py-3 backdrop-blur lg:hidden">
        <p className="font-heading text-base font-semibold uppercase tracking-wide">{unitName}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-cream transition-colors hover:bg-white/5"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Fundo escuro da gaveta (celular) */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "sidebar-edge fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-[#1a1a1a] to-[#121212] transition-transform duration-300 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
          className="absolute right-3 top-3 flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-cream lg:hidden"
        >
          <X className="size-4" />
        </button>
        {panel}
      </aside>
    </>
  );
}
