"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Scrollbar da marca (`.scroll-luxe`) — só no corpo do modal, nunca aninhada. */
const SCROLL = "scroll-luxe";

/**
 * Janela modal da agenda, no visual da marca. Não usa `<dialog>.showModal()`: a camada
 * superior do navegador deixaria inertes as listas de opções (`Select`), que abrem em portal.
 * Esc e clique no fundo fecham; a página de trás não rola enquanto a janela está aberta.
 *
 * Estrutura recomendada nos filhos:
 *   <form className="flex min-h-0 flex-1 flex-col">
 *     <DialogBody>…</DialogBody>
 *     <DialogFooter>…</DialogFooter>
 *   </form>
 */
export function DialogShell({
  title,
  eyebrow,
  onClose,
  wide,
  size,
  busy,
  children,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  wide?: boolean;
  /** md 28rem · lg 42rem · xl 64rem (comanda). */
  size?: "md" | "lg" | "xl";
  busy?: boolean;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || busyRef.current) return;
      if ((e.target as HTMLElement | null)?.closest?.('[role="listbox"]')) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-hidden bg-black/75 p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gold/35 bg-[#1a1a1a] text-foreground shadow-[0_40px_100px_-24px_rgb(0_0_0/0.95)] outline-none sm:my-auto sm:max-h-[90dvh] sm:w-[min(94vw,var(--dialog-w))] sm:rounded-2xl",
        )}
        style={
          {
            "--dialog-w": size === "xl" ? "64rem" : size === "lg" || wide ? "42rem" : size === "md" ? "28rem" : wide ? "42rem" : "28rem",
          } as React.CSSProperties
        }
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/80 bg-gradient-to-b from-[#242424] to-[#1a1a1a] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {eyebrow ? <p className="label-caps text-gold">{eyebrow}</p> : null}
            <h2 id={titleId} className="font-heading text-xl font-semibold uppercase tracking-wide">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar janela"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Corpo do modal. Com `scroll`, a rolagem fica só aqui — nunca aninhada nas listas. */
export function DialogBody({
  children,
  className,
  scroll = true,
  ref,
}: {
  children: React.ReactNode;
  className?: string;
  scroll?: boolean;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "min-h-0 flex-1 px-5 py-5 sm:px-6 sm:py-6",
        scroll && "overflow-y-auto overscroll-contain",
        scroll && SCROLL,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Rodapé de ações ancorado na base — fora da área de scroll, sem overlay. */
export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border/70 bg-[#141414] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
