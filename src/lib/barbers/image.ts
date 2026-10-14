/**
 * Compressão da foto do profissional (roda no navegador, antes do envio).
 *
 * Meta: foto leve (carrega rápido na agenda e nas listas) mas ainda nítida.
 * A foto aparece em no máximo ~100 px de largura na tela (até ~300 px em telas de
 * alta densidade), então 400 px de lado dá folga e pesa pouco.
 */

/** Lado da foto salva, em pixels (quadrada). */
export const PHOTO_OUT_SIZE = 400;
/** Peso-alvo do arquivo. A qualidade desce em degraus até caber. */
export const PHOTO_TARGET_BYTES = 45 * 1024;

const WEBP_QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5];
const JPEG_QUALITIES = [0.85, 0.77, 0.69, 0.6, 0.52];

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Tenta cada qualidade (da melhor para a pior) e devolve a primeira que cabe no peso-alvo. */
async function smallestWithin(canvas: HTMLCanvasElement, type: string, qualities: number[]) {
  let last: Blob | null = null;
  for (const q of qualities) {
    const blob = await toBlob(canvas, type, q);
    if (!blob || blob.type !== type) return null; // navegador não gera esse formato
    last = blob;
    if (blob.size <= PHOTO_TARGET_BYTES) break;
  }
  return last;
}

/** Comprime o canvas em WebP (JPEG se o navegador não gerar WebP). */
export async function encodePhoto(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await smallestWithin(canvas, "image/webp", WEBP_QUALITIES);
  if (webp) return webp;
  const jpeg = await smallestWithin(canvas, "image/jpeg", JPEG_QUALITIES);
  if (!jpeg) throw new Error("encode");
  return jpeg;
}

/**
 * Recorta o quadrado visível (`sx`, `sy`, lado `side`, em pixels da imagem original)
 * e reduz para no máximo PHOTO_OUT_SIZE, sem ampliar fotos pequenas.
 */
export async function cropToBlob(
  img: CanvasImageSource,
  sx: number,
  sy: number,
  side: number,
): Promise<Blob> {
  const out = Math.max(1, Math.min(PHOTO_OUT_SIZE, Math.round(side)));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
  return encodePhoto(canvas);
}
