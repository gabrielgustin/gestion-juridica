import { query, sql } from "@/lib/sql"
import { DOC_ENTITIES, type DocEntity } from "@/lib/documents"
import { DocumentRow, type DocRow } from "./document-row"

export type DocView = "recientes" | "escritos" | "sin-vincular" | "destacados" | "papelera" | "carpeta" | "todos"

const FOLDER_NAME = `case d.entity
  when 'matter' then (select caption from matters where id = d.entity_id)
  when 'client' then (select name from clients where id = d.entity_id)
  when 'court' then (select name from courts where id = d.entity_id)
  when 'task' then (select title from tasks where id = d.entity_id) end`

/** Lista de documentos según la vista o carpeta, con sus acciones. */
export async function DocumentList({ studioId, userId, view, entity, entityId, q, empty }: {
  studioId: string; userId: string; view: DocView; entity?: DocEntity; entityId?: string; q?: string; empty?: string
}) {
  const where = ["d.studio_id = $1", view === "papelera" ? "d.deleted_at is not null" : "d.deleted_at is null"]
  const args: unknown[] = [studioId, userId]
  if (view === "escritos") where.push("d.is_writ")
  if (view === "sin-vincular") where.push("d.entity is null")
  if (view === "destacados") where.push("s.user_id is not null")
  if (view === "carpeta" && entity) {
    args.push(entity); where.push(`d.entity = $${args.length}`)
    if (entityId) { args.push(entityId); where.push(`d.entity_id = $${args.length}`) }
  }
  if (q) { args.push(`%${q}%`); where.push(`d.name ilike $${args.length}`) }

  const rows = await query<DocRow & { size: string }>(
    `select d.id, d.name, d.size, d.content_type, d.created_at, d.is_writ, d.entity, d.entity_id, d.provider,
            s.user_id is not null as starred, d.deleted_at is not null as deleted, u.name as uploader,
            ${FOLDER_NAME} as folder_name
     from documents d
     left join document_stars s on s.document_id = d.id and s.user_id = $2
     left join "user" u on u.id = d.uploaded_by
     where ${where.join(" and ")}
     order by ${view === "papelera" ? "d.deleted_at" : "d.created_at"} desc limit 300`,
    args,
  )
  const docs: DocRow[] = rows.map((r) => ({
    ...r, size: Number(r.size), created_at: new Date(r.created_at).toISOString(),
    folder_path: r.entity && r.entity_id && !entityId ? `${DOC_ENTITIES[r.entity as DocEntity].path}/${r.entity_id}` : null,
    folder_name: entityId ? null : r.folder_name,
  }))

  const folderRows = await sql<{ entity: DocEntity; id: string; name: string }>`
    (select 'matter' as entity, id, caption as name from matters where studio_id = ${studioId} and deleted_at is null order by updated_at desc limit 200)
    union all (select 'client', id, name from clients where studio_id = ${studioId} and active order by name limit 200)
    union all (select 'court', id, name from courts where studio_id = ${studioId} and active order by name limit 200)`
  const folders = folderRows.map((f) => ({ value: `${f.entity}:${f.id}`, label: `${DOC_ENTITIES[f.entity].label}: ${f.name}` }))

  if (!docs.length) return <p className="p-4 text-sm text-ink-soft">{empty ?? "Todavía no hay documentos."}</p>
  return <ul className="divide-y divide-line">{docs.map((d) => <DocumentRow key={d.id} doc={d} folders={folders} />)}</ul>
}
