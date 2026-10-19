"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Move, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cropRectToBlob } from "@/lib/barbers/image";

const VIEW_MAX = 280; // lado máximo da área de ajuste, em px de tela
const VIEW_MAX_WIDE = 400; // largura máxima quando o recorte é retangular
const MAX_ZOOM = 4;

type Loaded = { el: HTMLImageElement; w: number; h: number; url: string };

type Props = {
  /** Imagem escolhida (arquivo original ou a foto atual). */
  source: Blob;
  onCancel: () => void;
  /** Recebe a foto já recortada e comprimida. */
  onConfirm: (blob: Blob) => void | Promise<void>;
  /** Máscara do recorte: círculo (avatar) ou quadrado de cantos arredondados (imagens). */
  shape?: "circle" | "rounded";
  /** Lado e peso-alvo da imagem final (padrão: o da foto do profissional). */
  outSize?: number;
  targetBytes?: number;
  /** Como chamar o arquivo na janela ("foto" ou "imagem"). */
  noun?: string;
  /** Proporção largura/altura do recorte (padrão 1 = quadrado; capa = 16/9). */
  aspect?: number;
};

/**
 * Janela para posicionar a foto: arraste para mover, use o controle (ou +/-) para ampliar.
 * A máscara mostra exatamente o que vai aparecer no avatar (ou na miniatura). A imagem nunca deixa
 * "buracos": o recorte sempre fica dentro da foto.
 */
export function PhotoCropper({ source, onCancel, onConfirm, shape = "circle", outSize, targetBytes, noun = "foto", aspect = 1 }: Props) {
  // Cabe em telas estreitas (janela = 92% da tela, menos o respiro interno). Este componente só monta no cliente.
  // Recortes largos (capa) ganham uma janela mais larga; a altura segue a proporção.
  const [VIEW] = useState(() =>
    Math.max(200, Math.min(aspect > 1 ? VIEW_MAX_WIDE : VIEW_MAX, Math.floor(window.innerWidth * 0.92) - 48)),
  );
  const VIEW_H = VIEW / aspect;
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [img, setImg] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Ponto da imagem (em pixels originais) que está no centro da área de ajuste.
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(source);
    const el = new Image();
    el.onload = () => {
      setImg({ el, w: el.naturalWidth, h: el.naturalHeight, url });
      setCenter({ x: el.naturalWidth / 2, y: el.naturalHeight / 2 });
    };
    el.onerror = () => setFailed(true);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [source]);

  // Escala base: a menor lado da foto cobre a área de ajuste; zoom multiplica.
  const base = img ? Math.max(VIEW / img.w, VIEW_H / img.h) : 1;
  const scale = base * zoom;

  function clamp(c: { x: number; y: number }, s: number) {
    if (!img) return c;
    const halfX = VIEW / 2 / s;
    const halfY = VIEW_H / 2 / s;
    return {
      x: Math.min(Math.max(c.x, halfX), img.w - halfX),
      y: Math.min(Math.max(c.y, halfY), img.h - halfY),
    };
  }

  function changeZoom(z: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    setCenter((c) => clamp(c, base * next));
  }

  function move(dxScreen: number, dyScreen: number) {
    setCenter((c) => clamp({ x: c.x - dxScreen / scale, y: c.y - dyScreen / scale }, scale));
  }

  async function confirm() {
    if (!img || busy) return;
    setBusy(true);
    try {
      const sw = VIEW / scale;
      const sh = VIEW_H / scale;
      await onConfirm(await cropRectToBlob(img.el, center.x - sw / 2, center.y - sh / 2, sw, sh, { outSize, targetBytes }));
    } finally {
      setBusy(false);
    }
  }

  const left = img ? VIEW / 2 - center.x * scale : 0;
  const top = img ? VIEW_H / 2 - center.y * scale : 0;

  return createPortal(
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="cropper-title"
      className={`m-auto ${aspect > 1 ? "w-[min(92vw,30rem)]" : "w-[min(92vw,24rem)]"} rounded-xl border border-gold/40 bg-card p-5 text-foreground sm:p-6 shadow-2xl backdrop:bg-black/70`}
    >
      <div className="flex flex-col items-center gap-5">
        <div className="flex w-full items-start justify-between gap-3">
          <div>
            <h2 id="cropper-title" className="font-heading text-xl font-semibold">
              Ajustar {noun}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Move className="size-3.5 text-gold" aria-hidden="true" />
              Arraste para reposicionar
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} disabled={busy} aria-label="Fechar">
            <X />
          </Button>
        </div>

        <div
          role="group"
          tabIndex={0}
          aria-label={`Área de ajuste da ${noun}. Use as setas para mover e + ou - para ampliar.`}
          className="relative touch-none overflow-hidden rounded-lg bg-[#0b0b0b] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          style={{ width: VIEW, height: VIEW_H, cursor: img ? "grab" : "default" }}
          onPointerDown={(e) => {
            if (!img) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            move(e.clientX - d.x, e.clientY - d.y);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => changeZoom(zoom - e.deltaY / 400)}
          onKeyDown={(e) => {
            const step = 12;
            if (e.key === "ArrowLeft") move(step, 0);
            else if (e.key === "ArrowRight") move(-step, 0);
            else if (e.key === "ArrowUp") move(0, step);
            else if (e.key === "ArrowDown") move(0, -step);
            else if (e.key === "+" || e.key === "=") changeZoom(zoom + 0.2);
            else if (e.key === "-") changeZoom(zoom - 0.2);
            else return;
            e.preventDefault();
          }}
        >
          {img ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={img.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ left, top, width: img.w * scale, height: img.h * scale }}
            />
          ) : failed ? (
            <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-destructive">
              Não foi possível abrir essa imagem.
            </p>
          ) : (
            <Loader2 className="absolute inset-0 m-auto size-6 animate-spin text-gold" aria-hidden="true" />
          )}
          {/* Máscara: escurece fora do círculo, que é o recorte final. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 border border-gold/70 ${shape === "circle" ? "rounded-full" : "rounded-2xl"}`}
            style={{ boxShadow: "0 0 0 999px rgb(0 0 0 / 0.6)" }}
          />
        </div>

        <div className="flex w-full items-center gap-3">
          <ZoomOut className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!img || busy}
            onChange={(e) => changeZoom(Number(e.target.value))}
            aria-label="Ampliar"
            className="h-1.5 w-full cursor-pointer accent-[var(--brand-gold)]"
          />
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>

        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" variant="luxe" onClick={confirm} disabled={!img || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            {busy ? "Enviando" : `Usar ${noun}`}
          </Button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
