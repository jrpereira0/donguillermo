"use client";

import { useRef, useState } from "react";
import { Camera, Crop, Loader2, Trash2 } from "lucide-react";
import { FieldError } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/barbers/types";
import { BarberAvatar } from "./barber-avatar";
import { PhotoCropper } from "./photo-cropper";

const MAX_INPUT_BYTES = 12 * 1024 * 1024; // arquivo original (será recortado e comprimido)

type Props = {
  unitId: string;
  /** Dono da imagem (barbeiro ou serviço): vira o nome do arquivo `<unidade>/<id>.<ext>`. */
  barberId: string;
  /** Monta o caminho do arquivo no bucket a partir da extensão (padrão: `<unidade>/<id>.<ext>`). */
  buildPath?: (ext: string) => string;
  /** Usado só pelo avatar padrão (iniciais). */
  name?: string;
  /** Bucket do Storage (padrão: fotos dos profissionais). */
  bucket?: string;
  /** Nome do campo oculto que leva o caminho ao formulário. */
  fieldName?: string;
  /** "foto" (padrão) ou "imagem": ajusta os textos. */
  noun?: "foto" | "imagem";
  /** Máscara do recorte e tamanho/peso da imagem final. */
  shape?: "circle" | "rounded";
  outSize?: number;
  targetBytes?: number;
  /** Pré-visualização própria (padrão: avatar com iniciais). */
  renderPreview?: (url: string | null) => React.ReactNode;
  /** Caminho já salvo no bucket (ou ""). */
  initialPath: string;
  /** URL pública atual para a pré-visualização (ou null). */
  initialUrl: string | null;
  /** Avisa o formulário para segurar o envio enquanto a foto sobe. */
  onBusyChange?: (busy: boolean) => void;
};

/**
 * Foto do profissional. Ao escolher a imagem abre o ajuste (arrastar e ampliar); ao
 * confirmar, a foto é recortada em quadrado, reduzida para 400 px e comprimida (WebP,
 * ~45 KB) e enviada direto ao Storage com a sessão de quem está logado (a RLS do bucket
 * só deixa a recepção da unidade gravar na pasta da unidade). O caminho vai no campo
 * oculto `photoPath`, que a action valida e salva.
 */
export function PhotoUploader({
  unitId,
  barberId,
  name = "?",
  buildPath,
  bucket = PHOTO_BUCKET,
  fieldName = "photoPath",
  noun = "foto",
  shape = "circle",
  outSize,
  targetBytes,
  renderPreview,
  initialPath,
  initialUrl,
  onBusyChange,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(initialPath);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  /** Imagem em ajuste (null = janela fechada). */
  const [editing, setEditing] = useState<Blob | null>(null);
  /** Última imagem usada, para reposicionar sem escolher o arquivo de novo. */
  const [source, setSource] = useState<Blob | null>(null);

  function setBusyBoth(v: boolean) {
    setBusy(v);
    onBusyChange?.(v);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setError(undefined);
    if (!file.type.startsWith("image/")) return setError("Escolha um arquivo de imagem.");
    if (file.size > MAX_INPUT_BYTES) return setError("Imagem muito grande (máx. 12 MB).");
    setEditing(file);
  }

  /** Reposicionar: usa a imagem original desta sessão; se não houver, a foto já salva. */
  async function reposition() {
    setError(undefined);
    if (source) return setEditing(source);
    if (!preview) return;
    setBusyBoth(true);
    try {
      const res = await fetch(preview);
      if (!res.ok) throw new Error("fetch");
      setEditing(await res.blob());
    } catch {
      setError(`Não foi possível abrir a ${noun} atual. Escolha o arquivo de novo.`);
    } finally {
      setBusyBoth(false);
    }
  }

  async function upload(blob: Blob) {
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const newPath = buildPath ? buildPath(ext) : `${unitId}/${barberId}.${ext}`;
    const supabase = createClient();
    setBusyBoth(true);
    try {
      const { error: upError } = await supabase.storage
        .from(bucket)
        .upload(newPath, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
      if (upError) {
        setError(`Não foi possível enviar a ${noun}. Tente novamente.`);
        setEditing(null);
        return;
      }
      // O arquivo antigo (se o formato mudou) é removido pela action ao salvar.
      setPath(newPath);
      setPreview(URL.createObjectURL(blob));
      setSource(editing);
      setEditing(null);
    } catch {
      setError(`Não foi possível enviar a ${noun}. Tente novamente.`);
      setEditing(null);
    } finally {
      setBusyBoth(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <input type="hidden" name={fieldName} value={path} />
      {renderPreview ? renderPreview(preview) : <BarberAvatar name={name || "?"} url={preview} className="size-24 text-3xl" />}
      <div className="flex flex-col items-start gap-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={onPick}
          aria-label={`Escolher ${noun}`}
          tabIndex={-1}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Camera />}
            {busy ? "Enviando…" : path ? `Trocar ${noun}` : `Escolher ${noun}`}
          </Button>
          {path ? (
            <>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={reposition}>
                <Crop />
                Reposicionar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setPath("");
                  setPreview(null);
                  setSource(null);
                }}
              >
                <Trash2 />
                Remover
              </Button>
            </>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          JPG, PNG ou WebP. Você ajusta o enquadramento e a {noun} é comprimida automaticamente.
        </p>
        <FieldError id="photo-error" message={error} />
      </div>

      {editing ? (
        <PhotoCropper
          source={editing}
          onCancel={() => setEditing(null)}
          onConfirm={upload}
          shape={shape}
          outSize={outSize}
          targetBytes={targetBytes}
          noun={noun}
        />
      ) : null}
    </div>
  );
}
