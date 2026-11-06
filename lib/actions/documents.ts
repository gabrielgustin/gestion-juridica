"use server"

import { revalidatePath } from "next/cache"
import { getMember } from "@/lib/session"
import { sql } from "@/lib/sql"
import { DOC_ENTITIES, hasRoomFor, isDocEntity, ownsEntity, type DocEntity } from "@/lib/documents"
import { deleteStored, storedSize } from "@/lib/storage"
import { ALLOWED_TYPES, isStudioPath } from "@/lib/storage-paths"

function refresh(entity?: string | null, entityId?: string | null) {
  revalidatePath("/documentos")
  if (entity && entityId && isDocEntity(entity)) revalidatePath(`${DOC_ENTITIES[entity].path}/${entityId}`)
}

/** Registra un archivo ya subido (a Blob o al disco local). Vuelve a validar ruta, tamaño real, tipo y cupo. */
export async function registerDocument(input: { pathname: string; name: string; contentType: string; entity?: string | null; entityId?: string | null; isWrit?: boolean }) {
  const { studio, user } = await getMember()
  if (!isStudioPath(input.pathname, studio.id)) return { error: "Ruta de archivo inválida." }
  if (!ALLOWED_TYPES.includes(input.contentType)) return { error: "Tipo de archivo no permitido." }
  const size = await storedSize(input.pathname)
  if (size === null) return { error: "No encontramos el archivo subido." }
  let entity: DocEntity | null = null
  if (input.entity || input.entityId) {
    if (!isDocEntity(input.entity) || !input.entityId || !(await ownsEntity(studio.id, input.entity, input.entityId))) {
      await deleteStored(input.pathname)
      return { error: "La carpeta elegida ya no existe." }
    }
    entity = input.entity
  }
  if (!(await hasRoomFor(studio.id, studio.plan, size))) {
    await deleteStored(input.pathname)
    return { error: "Te quedaste sin espacio en el plan." }
  }
  const name = input.name.trim().slice(0, 255) || "archivo"
  await sql`insert into documents (studio_id, name, pathname, size, content_type, entity, entity_id, is_writ, uploaded_by)
    values (${studio.id}, ${name}, ${input.pathname}, ${size}, ${input.contentType}, ${entity}, ${entity ? input.entityId : null}, ${Boolean(input.isWrit)}, ${user.id})`
  refresh(entity, input.entityId)
}

async function ownDoc(id: string) {
  const { studio, user } = await getMember()
  const [doc] = await sql<{ id: string; pathname: string | null; entity: string | null; entity_id: string | null; deleted_at: Date | null }>`
    select id, pathname, entity, entity_id, deleted_at from documents where id = ${id} and studio_id = ${studio.id}`
  if (!doc) throw new Error("No encontramos ese documento.")
  return { doc, studio, user }
}

export async function renameDocument(id: string, name: string) {
  const { doc } = await ownDoc(id)
  const clean = name.trim().slice(0, 255)
  if (!clean) return { error: "Poné un nombre." }
  await sql`update documents set name = ${clean}, updated_at = now() where id = ${id}`
  refresh(doc.entity, doc.entity_id)
}

/** Mueve el documento a otra carpeta (o a "Sin vincular" con entity null). */
export async function moveDocument(id: string, entity: string | null, entityId: string | null) {
  const { doc, studio } = await ownDoc(id)
  if (entity) {
    if (!isDocEntity(entity) || !entityId || !(await ownsEntity(studio.id, entity, entityId))) return { error: "Esa carpeta no existe." }
  }
  await sql`update documents set entity = ${entity || null}, entity_id = ${entity ? entityId : null}, updated_at = now() where id = ${id}`
  refresh(doc.entity, doc.entity_id)
  refresh(entity, entityId)
}

export async function setWrit(id: string, isWrit: boolean) {
  const { doc } = await ownDoc(id)
  await sql`update documents set is_writ = ${isWrit}, updated_at = now() where id = ${id}`
  refresh(doc.entity, doc.entity_id)
}

export async function toggleStar(id: string) {
  const { user } = await ownDoc(id)
  const removed = await sql`delete from document_stars where document_id = ${id} and user_id = ${user.id} returning document_id`
  if (!removed.length) await sql`insert into document_stars (document_id, user_id) values (${id}, ${user.id})`
  refresh()
}

export async function trashDocument(id: string) {
  const { doc } = await ownDoc(id)
  await sql`update documents set deleted_at = now() where id = ${id}`
  refresh(doc.entity, doc.entity_id)
}

export async function restoreDocument(id: string) {
  const { doc } = await ownDoc(id)
  await sql`update documents set deleted_at = null where id = ${id}`
  refresh(doc.entity, doc.entity_id)
}

/** Borra para siempre (solo desde la papelera): el registro y el archivo. */
export async function purgeDocument(id: string) {
  const { doc } = await ownDoc(id)
  if (!doc.deleted_at) throw new Error("Primero mandalo a la papelera.")
  if (doc.pathname) await deleteStored(doc.pathname)
  await sql`delete from documents where id = ${id}`
  refresh()
}

const LINK_HOSTS: Record<string, "drive" | "dropbox"> = {
  "drive.google.com": "drive", "docs.google.com": "drive",
  "www.dropbox.com": "dropbox", "dropbox.com": "dropbox", "dl.dropboxusercontent.com": "dropbox",
}

/** Hosts de Drive y Dropbox permitidos para vincular (nada de links arbitrarios). */
export async function providerOf(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" ? LINK_HOSTS[parsed.hostname] ?? null : null
  } catch {
    return null
  }
}

/** Vincula archivos de Drive o Dropbox a una carpeta (o a "Sin vincular"). Se guarda el link, no el archivo. */
export async function linkExternalDocuments(input: { links: { url: string; name?: string }[]; entity?: string | null; entityId?: string | null }) {
  const { studio, user } = await getMember()
  if (!input.links.length || input.links.length > 20) return { error: "Elegí entre 1 y 20 archivos." }
  let entity: DocEntity | null = null
  if (input.entity) {
    if (!isDocEntity(input.entity) || !input.entityId || !(await ownsEntity(studio.id, input.entity, input.entityId))) return { error: "La carpeta elegida ya no existe." }
    entity = input.entity
  }
  for (const link of input.links) {
    const provider = await providerOf(link.url)
    if (!provider) return { error: "Solo se pueden vincular links de Google Drive o Dropbox (https)." }
    const name = (link.name?.trim() || (provider === "drive" ? "Archivo de Google Drive" : "Archivo de Dropbox")).slice(0, 255)
    await sql`insert into documents (studio_id, name, external_url, provider, size, entity, entity_id, uploaded_by)
      values (${studio.id}, ${name}, ${link.url}, ${provider}, 0, ${entity}, ${entity ? input.entityId : null}, ${user.id})`
  }
  refresh(entity, input.entityId)
}
