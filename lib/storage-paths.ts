// Reglas de rutas y tipos de documentos, compartidas por el navegador y el servidor.

export const MAX_FILE_BYTES = 100 * 1024 * 1024
export const ALLOWED_TYPES = [
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text", "application/rtf", "application/zip", "message/rfc822",
]

/** Todas las rutas de un estudio cuelgan de studios/<id>/; así se valida que nadie registre archivos ajenos. */
export const studioPrefix = (studioId: string) => `studios/${studioId}/`
const SAFE_PATH = /^studios\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\/[^/\\]+$/

export function isStudioPath(pathname: string, studioId: string) {
  return SAFE_PATH.test(pathname) && pathname.startsWith(studioPrefix(studioId)) && !pathname.includes("..")
}

/** Nombre de archivo seguro para la ruta (el nombre visible se guarda aparte, tal cual). */
export const safeFileName = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|-+$/g, "").slice(-120) || "archivo"

export const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(1)} GB`
