import "server-only"
import { sql, type Queryable } from "@/lib/sql"
import type { CatalogKind } from "@/lib/catalogs"

export type Entity = "matter" | "client" | "court" | "task"
export type Option = { id: string; name: string; color?: string }

export const catalogOptions = (studioId: string, kind: CatalogKind) =>
  // Los estados de tribunal llevan el portal al lado (varios informan "EN TRÁMITE").
  sql<Option>`select id, name || coalesce(' · ' || upper(source), '') as name, color from catalog_items
    where studio_id = ${studioId} and kind = ${kind} and active order by source nulls first, sort, name`

export const memberOptions = (studioId: string) =>
  sql<Option>`select u.id, u.name from members m join "user" u on u.id = m.user_id where m.studio_id = ${studioId} and m.active order by u.name`

/** Reemplaza asignados y etiquetas de una entidad. Ignora ids que no sean del estudio. */
export async function setLinks(tx: Queryable, studioId: string, entity: Entity, entityId: string, userIds: string[], tagIds: string[]) {
  await tx.query(`delete from assignments where entity = $1 and entity_id = $2`, [entity, entityId])
  await tx.query(`delete from taggings where entity = $1 and entity_id = $2`, [entity, entityId])
  if (userIds.length)
    await tx.query(
      `insert into assignments (studio_id, entity, entity_id, user_id)
       select $1, $2, $3, m.user_id from members m where m.studio_id = $1 and m.user_id = any($4::text[])`,
      [studioId, entity, entityId, userIds],
    )
  if (tagIds.length)
    await tx.query(
      `insert into taggings (studio_id, entity, entity_id, tag_id)
       select $1, $2, $3, c.id from catalog_items c where c.studio_id = $1 and c.kind = 'etiqueta' and c.id = any($4::uuid[])`,
      [studioId, entity, entityId, tagIds],
    )
}

export type Links = { assignees: Option[]; tags: Option[] }

/** Asignados y etiquetas de muchas entidades en dos consultas. */
export async function loadLinks(entity: Entity, ids: string[]): Promise<Map<string, Links>> {
  const map = new Map<string, Links>(ids.map((id) => [id, { assignees: [], tags: [] }]))
  if (!ids.length) return map
  const users = await sql<{ entity_id: string; id: string; name: string }>`
    select a.entity_id, u.id, u.name from assignments a join "user" u on u.id = a.user_id
    where a.entity = ${entity} and a.entity_id = any(${ids}::uuid[]) order by u.name`
  const tags = await sql<{ entity_id: string; id: string; name: string; color: string }>`
    select t.entity_id, c.id, c.name, c.color from taggings t join catalog_items c on c.id = t.tag_id
    where t.entity = ${entity} and t.entity_id = any(${ids}::uuid[]) order by c.sort, c.name`
  for (const u of users) map.get(u.entity_id)?.assignees.push({ id: u.id, name: u.name })
  for (const t of tags) map.get(t.entity_id)?.tags.push({ id: t.id, name: t.name, color: t.color })
  return map
}

/** Lee una lista de ids de un FormData (campos repetidos con el mismo nombre). */
export const formIds = (form: FormData, name: string) => form.getAll(name).map(String).filter(Boolean)

export const formText = (form: FormData, name: string, max = 500) => {
  const value = String(form.get(name) ?? "").trim().slice(0, max)
  return value || null
}
