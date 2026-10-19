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
async function smallestWithin(canvas: HTMLCanvasElement, type: string, qualities: number[], targetBytes: number) {
  let last: Blob | null = null;
  for (const q of qualities) {
    const blob = await toBlob(canvas, type, q);
    if (!blob || blob.type !== type) return null; // navegador não gera esse formato
    last = blob;
    if (blob.size <= targetBytes) break;
  }
  return last;
}

/** Comprime o canvas em WebP (JPEG se o navegador não gerar WebP). */
export async function encodePhoto(canvas: HTMLCanvasElement, targetBytes = PHOTO_TARGET_BYTES): Promise<Blob> {
  const webp = await smallestWithin(canvas, "image/webp", WEBP_QUALITIES, targetBytes);
  if (webp) return webp;
  const jpeg = await smallestWithin(canvas, "image/jpeg", JPEG_QUALITIES, targetBytes);
  if (!jpeg) throw new Error("encode");
  return jpeg;
}

/**
 * Recorta o quadrado visível (`sx`, `sy`, lado `side`, em pixels da imagem original)
 * e reduz para no máximo `outSize` (padrão PHOTO_OUT_SIZE), sem ampliar fotos pequenas.
 */
export async function cropToBlob(
  img: CanvasImageSource,
  sx: number,
  sy: number,
  side: number,
  options: { outSize?: number; targetBytes?: number } = {},
): Promise<Blob> {
  return cropRectToBlob(img, sx, sy, side, side, options);
}

/**
 * Recorta um retângulo (`sx`, `sy`, `sw` x `sh`, em pixels da imagem original) e reduz para
 * no máximo `outSize` de LARGURA, mantendo a proporção do recorte (capa 16:9, por exemplo).
 */
export async function cropRectToBlob(
  img: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  options: { outSize?: number; targetBytes?: number } = {},
): Promise<Blob> {
  const outW = Math.max(1, Math.min(options.outSize ?? PHOTO_OUT_SIZE, Math.round(sw)));
  const outH = Math.max(1, Math.round((outW * sh) / sw));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return encodePhoto(canvas, options.targetBytes);
}

/**
 * Reduz a imagem inteira (sem recortar) para caber em `maxSide` pixels, preservando a
 * proporção e a transparência (logotipo). Não amplia imagens pequenas.
 */
export async function fitToBlob(
  img: HTMLImageElement,
  options: { maxSide?: number; targetBytes?: number } = {},
): Promise<Blob> {
  const maxSide = options.maxSide ?? PHOTO_OUT_SIZE;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return encodePhoto(canvas, options.targetBytes);
}
