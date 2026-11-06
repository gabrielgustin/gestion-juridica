"use server"

import { revalidatePath } from "next/cache"
import { getMember, requireAdmin } from "@/lib/session"
import { sql } from "@/lib/sql"
import { isDocEntity, ownsEntity, type DocEntity } from "@/lib/documents"
import { ALLOWED_TYPES, MAX_FILE_BYTES } from "@/lib/storage-paths"
import { connectionOf, disconnectDrive, fileMeta, folderFor, startUpload, syncFolder } from "@/lib/integrations/drive"

type Target = { entity?: string | null; entityId?: string | null }

async function target(studioId: string, input: Target): Promise<{ entity: DocEntity | null; error?: string }> {
  if (!input.entity && !input.entityId) return { entity: null }
  if (!isDocEntity(input.entity) || !input.entityId || !(await ownsEntity(studioId, input.entity, input.entityId))) return { entity: null, error: "La carpeta elegida ya no existe." }
  return { entity: input.entity }
}

/** Paso 1 de la subida: valida y devuelve la dirección de Google adonde el navegador manda el archivo. */
export async function startDriveUpload(input: Target & { name: string; contentType: string; size: number }) {
  const { studio } = await getMember()
  const conn = await connectionOf(studio.id)
  if (!conn) return { error: "Google Drive no está conectado." }
  if (!ALLOWED_TYPES.includes(input.contentType)) return { error: "Tipo de archivo no permitido." }
  if (!(input.size > 0) || input.size > MAX_FILE_BYTES) return { error: "El archivo está vacío o pesa más de 100 MB." }
  const { entity, error } = await target(studio.id, input)
  if (error) return { error }
  try {
    const url = await startUpload(conn, { name: input.name.trim().slice(0, 255) || "archivo", contentType: input.contentType, size: input.size }, await folderFor(conn, entity, input.entityId))
    return { url }
  } catch (e) {
    console.error("[drive] subida", e)
    return { error: "No se pudo preparar la subida a Google Drive." }
  }
}

/** Paso 2: el archivo ya está en Drive. Se confirma con Google que existe y quedó en la carpeta correcta antes de registrarlo. */
export async function registerDriveDocument(input: Target & { fileId: string; isWrit?: boolean }) {
  const { studio, user } = await getMember()
  const conn = await connectionOf(studio.id)
  if (!conn) return { error: "Google Drive no está conectado." }
  const { entity, error } = await target(studio.id, input)
  if (error) return { error }
  try {
    const meta = await fileMeta(conn, input.fileId)
    if (meta.trashed || !meta.parents?.includes(await folderFor(conn, entity, input.entityId))) return { error: "El archivo no quedó en la carpeta del estudio." }
    await sql`
      insert into documents (studio_id, name, size, content_type, drive_file_id, provider, entity, entity_id, is_writ, uploaded_by)
      values (${studio.id}, ${meta.name}, ${Number(meta.size ?? 0)}, ${meta.mimeType}, ${meta.id}, 'gdrive', ${entity}, ${entity ? input.entityId : null}, ${Boolean(input.isWrit)}, ${user.id})
      on conflict (studio_id, drive_file_id) where drive_file_id is not null do nothing`
  } catch (e) {
    console.error("[drive] registro", e)
    return { error: "No se pudo confirmar el archivo en Google Drive." }
  }
  revalidatePath("/documentos")
}

export async function syncDriveNow() {
  const { studio } = await getMember()
  try {
    const count = await syncFolder(studio.id)
    revalidatePath("/documentos")
    revalidatePath("/integraciones")
    return { count }
  } catch (e) {
    console.error("[drive] sync", e)
    await sql`update studio_drive set status = 'error', last_error = ${e instanceof Error ? e.message : String(e)} where studio_id = ${studio.id}`
    return { error: "No se pudo leer la carpeta de Drive. Probá reconectar." }
  }
}

export async function disconnectDriveNow() {
  const { studio } = await requireAdmin()
  await disconnectDrive(studio.id)
  revalidatePath("/documentos")
  revalidatePath("/integraciones")
}
