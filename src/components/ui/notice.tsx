"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";

const noop = () => () => {};

type NoticeProps = {
  /** Título curto, em caixa alta (ex.: "Alterações salvas"). */
  title: string;
  /** Frase de apoio (opcional). */
  children?: React.ReactNode;
  /** Chamado ao fechar (botão) ou quando o tempo acaba. */
  onClose: () => void;
  /** Tempo na tela, em ms. Passar o mouse ou focar pausa a contagem. */
  duration?: number;
};

/**
 * AVISO DE SUCESSO DA MARCA (`.notice-luxe`): cartão flutuante no canto superior
 * direito (centralizado no celular) com emblema em losango dourado (o mesmo
 * losango do padrão do login), título em Oswald, reflexo de luz na entrada e um
 * filete dourado que se esgota marcando o tempo. Some sozinho; pausa no hover.
 * Erros continuam inline (`FormAlert`), porque quem errou precisa vê-los junto do campo.
 * Renderiza em portal para não sofrer com animações/transforms dos pais.
 */
export function Notice({ title, children, onClose, duration = 5500 }: NoticeProps) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5 sm:justify-end">
      <div role="status" aria-live="polite" className="notice-luxe pointer-events-auto">
        <span className="notice-luxe__emblem" aria-hidden="true">
          <Check className="size-4" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="notice-luxe__title">{title}</p>
          {children ? <p className="notice-luxe__text">{children}</p> : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar aviso" className="notice-luxe__close">
          <X className="size-4" />
        </button>
        <span
          className="notice-luxe__timer"
          style={{ "--notice-ms": `${duration}ms` } as React.CSSProperties}
          onAnimationEnd={onClose}
          aria-hidden="true"
        />
      </div>
    </div>,
    document.body,
  );
}

/**
 * Aviso que chega pela URL (ex.: `?aviso=criado` depois de redirecionar). Mostra uma vez,
 * e ao fechar limpa o parâmetro para não reaparecer ao recarregar a página.
 */
export function FlashNotice({ title, children }: { title: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Notice
      title={title}
      onClose={() => {
        setOpen(false);
        window.history.replaceState(null, "", window.location.pathname);
      }}
    >
      {children}
    </Notice>
  );
}
