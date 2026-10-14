export const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const EXTENSIONS = Object.freeze({
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
});

export function validateUpload({ filename, contentType, sizeBytes } = {}) {
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 180) {
    return 'Selecciona un archivo con nombre válido.';
  }
  if (!Object.hasOwn(EXTENSIONS, contentType)) {
    return 'Formato no permitido. Usa JPG, PNG o WebP.';
  }
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!EXTENSIONS[contentType].includes(extension)) {
    return 'La extensión no coincide con el tipo de imagen.';
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_SIZE_BYTES) {
    return 'La imagen debe pesar menos de 5 MB.';
  }
  return null;
}

export function safeFilename(filename) {
  return filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-100);
}

export function isOwnImageKey(key) {
  return typeof key === 'string'
    && /^originales\/[a-zA-Z0-9._-]{1,140}\.(jpg|jpeg|png|webp)$/i.test(key);
}

export function imageTypeFromBytes(bytes) {
  if (!bytes || bytes.length < 3) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return 'image/png';
  if (bytes.length >= 12
    && Buffer.from(bytes).toString('ascii', 0, 4) === 'RIFF'
    && Buffer.from(bytes).toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
