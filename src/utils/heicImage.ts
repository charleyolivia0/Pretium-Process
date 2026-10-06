const HEIC_MIME_HINTS = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];
const HEIC_EXTENSIONS = ["heic", "heif", "heics", "heifs"];
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "mif1", "msf1"];
const BROWSER_RASTER_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
]);

/** True when MIME is a normal browser image (not HEIC). */
export function isBrowserRasterImageMime(mimeType?: string) {
  const m = mimeType?.toLowerCase() ?? "";
  return BROWSER_RASTER_MIMES.has(m);
}

export function isLikelyHeicFormat(mimeType?: string, fileName?: string) {
  const m = mimeType?.toLowerCase() ?? "";
  // After upload conversion we store JPEG bytes with image/jpeg but may keep IMG_x.HEIC name.
  if (isBrowserRasterImageMime(m)) return false;
  if (HEIC_MIME_HINTS.some((hint) => m === hint || m.includes("heic") || m.includes("heif"))) {
    return true;
  }
  const ext = fileExtensionFromName(fileName).toLowerCase();
  if (HEIC_EXTENSIONS.includes(ext)) return true;
  return false;
}

function fileExtensionFromName(name?: string) {
  if (!name) return "";
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  return name.slice(lastDot + 1);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function isHeicBrand(brand: string) {
  const b = brand.toLowerCase();
  return HEIC_BRANDS.includes(b);
}

/** Detect HEIC/HEIF from ISO BMFF `ftyp` box (works when mime/extension are missing). */
export async function sniffHeicBlob(blob: Blob): Promise<boolean> {
  try {
    const buf = await blob.slice(0, 64).arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length < 12) return false;

    for (let i = 0; i <= Math.min(bytes.length - 8, 32); i++) {
      if (ascii(bytes, i, 4) !== "ftyp") continue;
      if (isHeicBrand(ascii(bytes, i + 4, 4))) return true;
      if (bytes.length >= i + 16 && isHeicBrand(ascii(bytes, i + 8, 4))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function blobIsHeic(blob: Blob, mimeType?: string, fileName?: string) {
  if (isBrowserRasterImageMime(mimeType)) return false;
  if (isLikelyHeicFormat(mimeType, fileName)) return true;
  return sniffHeicBlob(blob);
}

const HEIC_CONVERSION_USER_MESSAGE =
  "Could not convert HEIC photo. Try exporting as JPEG from Photos, or use a different image.";

export function formatHeicConversionError(err: unknown, fileName?: string): string {
  const label = fileName?.trim() ? `"${fileName.trim()}"` : "photo";
  const detail =
    err instanceof Error
      ? err.message.trim()
      : typeof err === "string"
        ? err.trim()
        : "";
  if (detail) {
    return `${HEIC_CONVERSION_USER_MESSAGE} (${label}: ${detail})`;
  }
  return `${HEIC_CONVERSION_USER_MESSAGE} (${label})`;
}

type HeicConverterModule = typeof import("heic-to");

let heicConverterModule: HeicConverterModule | null = null;
let heicConverterLoad: Promise<HeicConverterModule> | null = null;

async function loadHeicConverter(): Promise<HeicConverterModule> {
  if (heicConverterModule) return heicConverterModule;
  if (!heicConverterLoad) {
    heicConverterLoad = import("heic-to").then((mod) => {
      heicConverterModule = mod;
      return mod;
    });
  }
  return heicConverterLoad;
}

async function fileIsHeic(file: File): Promise<boolean> {
  if (isLikelyHeicFormat(file.type, file.name)) return true;
  if (await sniffHeicBlob(file)) return true;
  const { isHeic } = await loadHeicConverter();
  return isHeic(file);
}

async function convertHeicBlobToJpeg(blob: Blob): Promise<Blob> {
  const { heicTo } = await loadHeicConverter();
  const jpegBlob = await heicTo({
    blob,
    type: "image/jpeg",
    quality: 0.88,
  });
  if (!(jpegBlob instanceof Blob)) {
    throw new Error("HEIC conversion did not return an image");
  }
  return jpegBlob;
}

const displayUrlCache = new Map<string, string>();
const displayUrlInflight = new Map<string, Promise<string>>();

function cacheKey(url: string, retryKey: number) {
  return `${url}::${retryKey}`;
}

/** JPEG object URL for display; converts HEIC/HEIF when needed. */
export async function resolveDisplayImageUrl(
  fileUrl: string,
  mimeType?: string,
  fileName?: string,
  options?: { forceConvert?: boolean; retryKey?: number },
): Promise<string> {
  const url = fileUrl.trim();
  if (!url) return "";

  const key = cacheKey(url, options?.retryKey ?? 0);
  const cached = displayUrlCache.get(key);
  if (cached) return cached;

  let inflight = displayUrlInflight.get(key);
  if (!inflight) {
    inflight = (async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image (${response.status})`);
      }
      const blob = await response.blob();

      const needsConvert = await blobIsHeic(blob, mimeType, fileName);

      if (!needsConvert) {
        return url;
      }

      const jpegBlob = await convertHeicBlobToJpeg(blob);
      const objectUrl = URL.createObjectURL(jpegBlob);
      displayUrlCache.set(key, objectUrl);
      displayUrlInflight.delete(key);
      return objectUrl;
    })().catch((err) => {
      displayUrlInflight.delete(key);
      throw err;
    });
    displayUrlInflight.set(key, inflight);
  }

  return inflight;
}

/** HEIC→JPEG before upload. Non-HEIC files pass through unchanged. Throws on conversion failure. */
export async function normalizeImageFileForUpload(file: File): Promise<File> {
  if (!(await fileIsHeic(file))) {
    return file;
  }
  try {
    const jpegBlob = await convertHeicBlobToJpeg(file);
    const baseName = file.name.replace(/\.(heic|heif|heics|heifs)$/i, "") || "photo";
    return new File([jpegBlob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch (err) {
    throw new Error(formatHeicConversionError(err, file.name));
  }
}
