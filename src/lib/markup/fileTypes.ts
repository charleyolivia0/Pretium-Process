export function isPdfFileName(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

export function isRasterFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif")
  );
}

export function isPdfMimeType(mimeType?: string): boolean {
  return mimeType?.toLowerCase().includes("pdf") ?? false;
}

function fileExtensionFromName(name?: string) {
  if (!name) return "";
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  return name.slice(lastDot + 1);
}

export function isLikelyImageFile(mimeType?: string, fileName?: string) {
  if (mimeType && mimeType.toLowerCase().startsWith("image/")) return true;
  const extension = fileExtensionFromName(fileName).toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "avif"].includes(extension);
}

export function canMarkupSitePhoto(mimeType?: string, fileName?: string) {
  const name = fileName ?? "";
  return (
    isLikelyImageFile(mimeType, name) ||
    isPdfMimeType(mimeType) ||
    isPdfFileName(name) ||
    fileExtensionFromName(name).toLowerCase() === "pdf"
  );
}

export function sitePhotoSupportsRasterMarkup(mimeType?: string, fileName?: string) {
  return isLikelyImageFile(mimeType, fileName);
}

export function sitePhotoSupportsPdfMarkup(mimeType?: string, fileName?: string) {
  const name = fileName ?? "";
  return isPdfMimeType(mimeType) || isPdfFileName(name) || fileExtensionFromName(name).toLowerCase() === "pdf";
}
