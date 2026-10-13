export const IMAGE_MAX_DIMENSION = 1600;
export const IMAGE_QUALITY = 0.78;
export const IMAGE_MAX_BYTES = 300 * 1024;

const JPEG_MIME = 'image/jpeg';
const WEBP_MIME = 'image/webp';

export interface CompressedImage {
  blob: Blob;
  dataUrl: string;
  mime: string;
  ext: string;
  width: number;
  height: number;
}

export type ImageInput = Blob | string | HTMLCanvasElement | HTMLImageElement;

let webpSupport: boolean | null = null;

export const supportsWebP = (): boolean => {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL(WEBP_MIME).startsWith(`data:${WEBP_MIME}`);
  } catch {
    webpSupport = false;
  }
  return webpSupport;
};

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadImage = (source: string, crossOrigin = false): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível decodificar a imagem'));
    image.src = source;
  });

const createObjectUrl = (blob: Blob): string =>
  typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(blob)
    : '';

interface DecodedSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

const decode = async (input: ImageInput): Promise<DecodedSource> => {
  if (input instanceof HTMLCanvasElement) {
    return { source: input, width: input.width, height: input.height, release: () => undefined };
  }

  if (input instanceof HTMLImageElement) {
    const width = input.naturalWidth || input.width;
    const height = input.naturalHeight || input.height;
    return { source: input, width, height, release: () => undefined };
  }

  if (typeof input === 'string') {
    const image = await loadImage(input, /^https?:/i.test(input));
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => undefined,
    };
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(input);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // navegador sem suporte ao formato do arquivo: tenta via <img> + object URL
    }
  }

  const url = createObjectUrl(input);
  if (!url) throw new Error('Formato de imagem não suportado neste navegador');
  try {
    const image = await loadImage(url);
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
};

const encode = async (
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });

interface CompressOptions {
  maxDimension?: number;
  quality?: number;
  format?: 'webp' | 'jpeg';
}

const pickTargetMime = (options: CompressOptions, quality: number): string => {
  if (options.format === 'jpeg') return JPEG_MIME;
  return supportsWebP() && quality < 1 ? WEBP_MIME : JPEG_MIME;
};

export const compressImage = async (
  input: ImageInput,
  options: CompressOptions = {},
): Promise<CompressedImage | null> => {
  const maxDimension = options.maxDimension ?? IMAGE_MAX_DIMENSION;
  const quality = options.quality ?? IMAGE_QUALITY;

  let decoded: DecodedSource | null = null;
  try {
    decoded = await decode(input);
    const { width: sourceWidth, height: sourceHeight } = decoded;
    if (!sourceWidth || !sourceHeight) return null;

    const ratio = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));

    const targetMime = pickTargetMime(options, quality);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (targetMime === JPEG_MIME) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(decoded.source, 0, 0, width, height);

    let blob = await encode(canvas, targetMime, quality);
    if (!blob) return null;
    if (blob.type !== targetMime) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(decoded.source, 0, 0, width, height);
      blob = await encode(canvas, JPEG_MIME, quality);
      if (!blob) return null;
    }

    const mime = blob.type || JPEG_MIME;
    const dataUrl = await blobToDataUrl(blob);
    return {
      blob,
      dataUrl,
      mime,
      ext: mime === WEBP_MIME ? 'webp' : 'jpg',
      width,
      height,
    };
  } catch (error) {
    console.warn('Falha ao comprimir imagem, mantendo o original:', error);
    return null;
  } finally {
    decoded?.release();
  }
};

export const compressToDataUrl = async (
  input: ImageInput,
  options: CompressOptions = {},
): Promise<string | null> => {
  const compressed = await compressImage(input, options);
  return compressed ? compressed.dataUrl : null;
};

export const compressToFile = async (
  input: ImageInput,
  fileName: string,
  options: CompressOptions = {},
): Promise<File | null> => {
  const compressed = await compressImage(input, options);
  if (!compressed) return null;
  const base = fileName.replace(/\.[^.]+$/, '');
  return new File([compressed.blob], `${base}.${compressed.ext}`, { type: compressed.mime });
};
