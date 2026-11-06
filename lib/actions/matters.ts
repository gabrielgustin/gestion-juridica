"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getMember } from "@/lib/session"
import { sql, transaction, type Queryable } from "@/lib/sql"
import { formIds, formText, setLinks } from "@/lib/entities"
import { planOf } from "@/lib/plans"
import type { CatalogKind } from "@/lib/catalogs"
import type { ActionResult } from "@/app/(app)/configuracion/actions"

class UserError extends Error {}

async function ownCatalog(tx: Queryable, studioId: string, kind: CatalogKind, id: string | null) {
  if (!id) return null
  const [row] = await tx.query<{ id: string }>(`select id from catalog_items where id = $1 and studio_id = $2 and kind = $3`, [id, studioId, kind])
  if (!row) throw new UserError("Elegiste una opción que ya no existe. Recargá la página.")
  return row.id
}

async function assertUnderLimit(tx: Queryable, studioId: string, plan: string) {
  const [{ count }] = await tx.query<{ count: string }>(
    `select count(*) from matters where studio_id = $1 and not archived and deleted_at is null`, [studioId])
  if (Number(count) >= planOf(plan).expedientes) throw new UserError("Llegaste al límite de expedientes activos de tu plan. Archivá los terminados o cambiá de plan.")
}

/** Busca otro expediente del estudio con la misma numeración completa o el mismo link del tribunal. */
async function findDuplicate(tx: Queryable, studioId: string, id: string | null, fullNumber: string | null, courtUrl: string | null) {
  if (!fullNumber && !courtUrl) return null
  const [row] = await tx.query<{ id: string; caption: string; archived: boolean; deleted_at: Date | null }>(
    `select id, caption, archived, deleted_at from matters
     where studio_id = $1 and id is distinct from $2::uuid
       and ((lower(full_number) = lower($3)) or (court_url = $4)) limit 1`,
    [studioId, id, fullNumber, courtUrl],
  )
  return row ?? null
}

export async function saveMatter(id: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio, user } = await getMember()
  const caption = formText(form, "caption", 500)
  if (!caption) return { error: "La carátula es obligatoria." }
  const yearText = formText(form, "year", 4)
  const year = yearText ? Number(yearText) : null
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) return { error: "El año no es válido." }
  const courtUrl = formText(form, "court_url", 1000)
  if (courtUrl && !/^https?:\/\//i.test(courtUrl)) return { error: "El link del tribunal tiene que empezar con http:// o https://" }
  const fullNumber = formText(form, "full_number", 200)

  let savedId: string
  try {
    savedId = await transaction(async (tx) => {
      const dup = await findDuplicate(tx, studio.id, id, fullNumber, courtUrl)
      if (dup) {
        const where = dup.deleted_at ? " (está en la papelera)" : dup.archived ? " (está en el Archivo)" : ""
        throw new UserError(`Esta causa ya está cargada en el estudio: «${dup.caption}»${where}.`)
      }
      const values = [
        caption, formText(form, "number", 100), year, fullNumber, courtUrl,
        await ownCatalog(tx, studio.id, "fuero", formText(form, "fuero_id")),
        await ownCatalog(tx, studio.id, "estado", formText(form, "estado_id")),
        await ownCatalog(tx, studio.id, "etapa", formText(form, "etapa_id")),
        await ownCatalog(tx, studio.id, "parte", formText(form, "parte_id")),
      ]
      const courtId = formText(form, "court_id")
      if (courtId && !(await tx.query(`select 1 from courts where id = $1 and studio_id = $2`, [courtId, studio.id])).length)
        throw new UserError("El juzgado elegido ya no existe.")
      values.push(courtId, formText(form, "notes", 10000))

      let matterId = id
      if (id) {
        const rows = await tx.query(
          `update matters set caption = $1, number = $2, year = $3, full_number = $4, court_url = $5, fuero_id = $6, estado_id = $7,
             etapa_id = $8, parte_id = $9, court_id = $10, notes = $11, updated_at = now()
           where id = $12 and studio_id = $13 returning id`,
          [...values, id, studio.id],
        )
        if (!rows.length) throw new UserError("No encontramos ese expediente.")
      } else {
        await assertUnderLimit(tx, studio.id, studio.plan)
        const [row] = await tx.query<{ id: string }>(
          `insert into matters (caption, number, year, full_number, court_url, fuero_id, estado_id, etapa_id, parte_id, court_id, notes, studio_id, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
          [...values, studio.id, user.id],
        )
        matterId = row.id
      }

      await tx.query(`delete from matter_clients where matter_id = $1`, [matterId])
      const clientIds = formIds(form, "clients")
      if (clientIds.length)
        await tx.query(
          `insert into matter_clients (matter_id, client_id) select $1, id from clients where studio_id = $2 and id = any($3::uuid[])`,
          [matterId, studio.id, clientIds],
        )
      await setLinks(tx, studio.id, "matter", matterId!, formIds(form, "assignees"), formIds(form, "tags"))
      return matterId!
    })
  } catch (error) {
    if (error instanceof UserError) return { error: error.message }
    throw error
  }

  revalidatePath("/expedientes")
  if (!id) redirect(`/expedientes/${savedId}`)
  revalidatePath(`/expedientes/${id}`)
  return { ok: "Guardado." }
}

async function ownMatter(studioId: string, id: string) {
  const [row] = await sql<{ id: string; archived: boolean; deleted_at: Date | null }>`
    select id, archived, deleted_at from matters where id = ${id} and studio_id = ${studioId}`
  if (!row) throw new Error("No encontramos ese expediente.")
  return row
}

function refresh(id: string) {
  revalidatePath("/expedientes")
  revalidatePath(`/expedientes/${id}`)
}

export async function setArchived(id: string, archived: boolean): Promise<ActionResult> {
  const { studio } = await getMember()
  const matter = await ownMatter(studio.id, id)
  if (!archived && !matter.deleted_at) {
    const [{ count }] = await sql<{ count: string }>`select count(*) from matters where studio_id = ${studio.id} and not archived and deleted_at is null`
    if (Number(count) >= planOf(studio.plan).expedientes) return { error: "Llegaste al límite de expedientes activos de tu plan." }
  }
  await sql`update matters set archived = ${archived}, updated_at = now() where id = ${id}`
  refresh(id)
}

export async function trashMatter(id: string) {
  const { studio } = await getMember()
  await ownMatter(studio.id, id)
  await sql`update matters set deleted_at = now() where id = ${id}`
  refresh(id)
}

export async function restoreMatter(id: string): Promise<ActionResult> {
  const { studio } = await getMember()
  const matter = await ownMatter(studio.id, id)
  if (!matter.archived) {
    const [{ count }] = await sql<{ count: string }>`select count(*) from matters where studio_id = ${studio.id} and not archived and deleted_at is null`
    if (Number(count) >= planOf(studio.plan).expedientes) return { error: "Llegaste al límite de expedientes activos de tu plan." }
  }
  await sql`update matters set deleted_at = null where id = ${id}`
  refresh(id)
}

/** Borrado definitivo: solo desde la papelera. */
export async function purgeMatter(id: string) {
  const { studio } = await getMember()
  const matter = await ownMatter(studio.id, id)
  if (!matter.deleted_at) throw new Error("Primero mandalo a la papelera.")
  await sql`delete from assignments where entity = 'matter' and entity_id = ${id}`
  await sql`delete from taggings where entity = 'matter' and entity_id = ${id}`
  await sql`update documents set entity = null, entity_id = null where entity = 'matter' and entity_id = ${id}`
  await sql`delete from matters where id = ${id}`
  revalidatePath("/expedientes")
  redirect("/expedientes?vista=papelera")
}

export async function addActivity(matterId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { studio, user } = await getMember()
  await ownMatter(studio.id, matterId)
  const title = formText(form, "title", 300)
  if (!title) return { error: "Poné un título." }
  const date = formText(form, "occurred_at", 10)
  const occurredAt = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00-03:00` : new Date().toISOString()
  await sql`insert into matter_activities (matter_id, occurred_at, title, body, created_by)
    values (${matterId}, ${occurredAt}, ${title}, ${formText(form, "body", 10000)}, ${user.id})`
  await sql`update matters set last_activity_at = greatest(coalesce(last_activity_at, ${occurredAt}::timestamptz), ${occurredAt}::timestamptz), updated_at = now() where id = ${matterId}`
  refresh(matterId)
  return { ok: "Actuación agregada." }
}

export async function deleteActivity(matterId: string, activityId: string) {
  const { studio } = await getMember()
  await ownMatter(studio.id, matterId)
  // Solo las manuales: las que llegan de un tribunal se vuelven a traer en cada sincronización.
  await sql`delete from matter_activities where id = ${activityId} and matter_id = ${matterId} and source = 'manual'`
  await sql`update matters set last_activity_at = (select max(occurred_at) from matter_activities where matter_id = ${matterId}) where id = ${matterId}`
  refresh(matterId)
}
